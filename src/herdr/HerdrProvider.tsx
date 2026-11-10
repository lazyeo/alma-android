import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { HandoffDesktop } from '../handoff/HandoffProvider'
import {
  deliveredNotifications,
  notificationTypeEnabled,
  scopedNotificationTag,
  showForegroundNotification,
  type NotificationDeduper,
  type NotificationSettings,
} from '../notifications'
import { desktopAgentPanePath } from '../desktopRoutes'
import { stripAnsi } from './transcript'
import {
  agentTurnIdentity,
  chatPageItems,
  lastAssistantText,
  notificationMessage,
  pendingAgentQuestion,
} from './lastAssistantText'
import {
  agentListFromSnapshot,
  paneTurnTitle,
  parseBlockedPrompt,
  shouldNotifyAgentStatus,
  type AgentWorkspaceModel,
  type HerdrPane,
  type HerdrSnapshot,
} from './model'
import {
  effectiveComputer,
  loadSelectedComputer,
  remotePollDelay,
  saveSelectedComputer,
  snapshotFromWorkspaces,
  type HerdrComputer,
} from './computers'
import { parseHerdrSetup, type HerdrSetupState } from './setup'

export interface DesktopHerdrState {
  desktopOnline: boolean
  online: boolean
  supported: boolean
  snapshot?: HerdrSnapshot
  mutedWorkspaces: string[]
  error?: string
  /** Another computer this desktop reaches; undefined is the desktop. */
  computerId?: string
  /** Remote computers have no live socket, so their board is polled. */
  transport?: 'socket' | 'poll'
  /** Herdr Core install/start state while Herdr is offline. */
  setup?: HerdrSetupState
}

interface HerdrValue {
  byDesktop: Record<string, DesktopHerdrState>
  agents(desktopId: string): AgentWorkspaceModel[]
  retry(desktopId: string): void
  /**
   * Herdr API of a desktop, pointed at the computer chosen for it; also for
   * rows rendered outside that desktop's connection scope.
   */
  apiFor(desktopId: string): HandoffDesktop['api'] | undefined
  /** Other computers for Herdr; undefined hides the switcher (old desktop). */
  computers(desktopId: string): HerdrComputer[] | undefined
  /** The computer Herdr currently talks to; undefined is the desktop. */
  computerFor(desktopId: string): string | undefined
  selectComputer(desktopId: string, computerId?: string): void
  setWorkspaceMuted(
    desktopId: string,
    workspaceId: string,
    muted: boolean,
  ): Promise<void>
}

const HerdrContext = createContext<HerdrValue | null>(null)

export function useHerdr() {
  const value = useContext(HerdrContext)
  if (!value) throw new Error('useHerdr requires HerdrProvider')
  return value
}

export function useHerdrNotificationEvents({
  desktopId,
  computerId,
  desktopName,
  panes,
  mutedWorkspaces,
  pathname,
  enabled,
  api,
  notify = showForegroundNotification,
  dedupe = deliveredNotifications,
}: {
  desktopId: string
  /** Pane ids repeat across computers, so tags carry the computer. */
  computerId?: string
  desktopName: string
  panes: HerdrPane[]
  mutedWorkspaces: string[]
  pathname: string
  enabled: boolean
  api: Pick<HandoffDesktop['api'], 'readHerdrPane' | 'getHerdrChat'>
  notify?: typeof showForegroundNotification
  dedupe?: NotificationDeduper
}) {
  const previous = useRef(new Map<string, HerdrPane['agent_status']>())
  return useCallback(() => {
    const next = new Map<string, HerdrPane['agent_status']>()
    for (const pane of panes) {
      const from = previous.current.get(pane.pane_id)
      const to = pane.agent_status
      next.set(pane.pane_id, to)
      if (from === undefined || from === to || !enabled) continue
      if (
        !shouldNotifyAgentStatus({
          workspaceId: pane.workspace_id,
          from,
          to,
          muted: mutedWorkspaces.includes(pane.workspace_id),
          viewingPane:
            document.visibilityState === 'visible' &&
            pathname === desktopAgentPanePath(desktopId, pane.pane_id),
        })
      )
        continue
      const paneKey = computerId
        ? `${computerId}/${pane.pane_id}`
        : pane.pane_id
      const sendNotification = async () => {
        const [screen, chat] = await Promise.allSettled([
          to === 'blocked'
            ? api.readHerdrPane(pane.pane_id)
            : Promise.resolve(undefined),
          api.getHerdrChat(pane.pane_id),
        ])
        const items =
          chat.status === 'fulfilled' ? chatPageItems(chat.value) : []
        const turn = agentTurnIdentity(items, to)
        if (
          turn &&
          !dedupe.claim(
            scopedNotificationTag(desktopId, `agent:${paneKey}:${to}:${turn}`),
          )
        )
          return
        let message = ''
        if (to === 'blocked') {
          const prompt =
            screen.status === 'fulfilled'
              ? parseBlockedPrompt(stripAnsi(screen.value?.read?.text ?? ''))
              : null
          // Prefer the agent's own words from the transcript over the screen.
          message = notificationMessage(
            pendingAgentQuestion(
              items,
              prompt?.options.map((option) => option.label),
            ) ||
              prompt?.question ||
              '',
          )
        }
        // Message enrichment is best effort; never suppress notification.
        if (!message && chat.status === 'fulfilled')
          message = lastAssistantText(chat.value, to === 'blocked')
        const paneTitle =
          pane.terminal_title_stripped?.trim() ||
          pane.title?.trim() ||
          pane.agent?.trim() ||
          undefined
        const turnTitle = paneTurnTitle(pane)
        await notify({
          type: 'agent-needs-you',
          tag: scopedNotificationTag(desktopId, `agent:${paneKey}:${to}`),
          url: desktopAgentPanePath(desktopId, pane.pane_id),
          threadTitle:
            turnTitle && turnTitle !== paneTitle
              ? [paneTitle, turnTitle].filter(Boolean).join(' — ')
              : paneTitle,
          desktopName,
          ...(message ? { message } : {}),
        })
      }
      void sendNotification().catch(() => undefined)
    }
    previous.current = next
  }, [
    api,
    computerId,
    dedupe,
    desktopId,
    desktopName,
    enabled,
    mutedWorkspaces,
    notify,
    panes,
    pathname,
  ])
}

const statusOf = (reason: unknown) =>
  reason && typeof reason === 'object' && 'status' in reason
    ? Number(reason.status)
    : 0
const messageOf = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason)

/** Keeps one desktop's list of other Herdr computers fresh. */
function HerdrComputersSource({
  desktop,
  retryToken,
  onComputers,
}: {
  desktop: HandoffDesktop
  retryToken: number
  onComputers(desktopId: string, computers?: HerdrComputer[]): void
}) {
  const { api, id: desktopId, online } = desktop
  useEffect(() => {
    if (!online) return
    let current = true
    const load = () =>
      void api
        .listHerdrComputers()
        .then((result) => {
          if (!current) return
          // 503: the desktop can't reach other computers right now; keep the
          // switcher hidden but remember the choice for when it can.
          onComputers(
            desktopId,
            result.status === 'ok'
              ? result.computers
              : result.status === 'unavailable'
                ? []
                : undefined,
          )
        })
        .catch(() => {
          if (current) onComputers(desktopId, undefined)
        })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    load()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      current = false
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api, desktopId, online, onComputers, retryToken])
  return null
}

function HerdrDesktopSource({
  desktop,
  api,
  settingsRef,
  onState,
  retryToken,
}: {
  desktop: HandoffDesktop
  /** `desktop.api` pointed at the chosen computer. */
  api: HandoffDesktop['api']
  settingsRef: React.MutableRefObject<NotificationSettings>
  onState(desktopId: string, state: DesktopHerdrState): void
  retryToken: number
}) {
  const location = useLocation()
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname
  const remote = api.herdrComputer !== undefined
  const stateRef = useRef<DesktopHerdrState>({
    desktopOnline: desktop.online,
    online: false,
    supported: true,
    mutedWorkspaces: [],
    computerId: api.herdrComputer,
    transport: remote ? 'poll' : 'socket',
  })
  const { id: desktopId, name: desktopName, online } = desktop
  const notifySnapshot = useHerdrNotificationEvents({
    desktopId,
    computerId: api.herdrComputer,
    desktopName,
    panes: stateRef.current.snapshot?.panes ?? [],
    mutedWorkspaces: stateRef.current.mutedWorkspaces,
    pathname: location.pathname,
    enabled: notificationTypeEnabled(settingsRef.current, 'agent-needs-you'),
    api,
  })

  const publish = useCallback(
    (patch: Partial<DesktopHerdrState>) => {
      stateRef.current = { ...stateRef.current, ...patch }
      onState(desktopId, stateRef.current)
    },
    [desktopId, onState],
  )

  useEffect(() => notifySnapshot(), [notifySnapshot])

  useEffect(() => {
    let current = true
    publish({ desktopOnline: online, error: undefined })
    if (!online) {
      publish({ online: false })
      return
    }
    // Setup only matters while Herdr is offline; online Herdr reports
    // misleading phases ("stopped", even "missing" on a legacy socket).
    const readSetup = async () => {
      try {
        return await api.getHerdrSetup()
      } catch {
        return undefined
      }
    }
    void Promise.all([api.getHerdrInfo(), api.getHerdrMutes()])
      .then(async ([info, mutes]) => {
        if (!current) return
        const herdrOnline = info.online === true
        publish({
          online: herdrOnline,
          supported: true,
          mutedWorkspaces: Array.isArray(mutes.workspaces)
            ? mutes.workspaces
            : [],
          error: undefined,
          setup: herdrOnline ? undefined : await readSetup(),
        })
      })
      .catch((reason) => {
        if (!current) return
        const unsupported = [404, 405, 501].includes(statusOf(reason))
        publish({
          online: false,
          supported: !unsupported,
          error: unsupported ? undefined : messageOf(reason),
        })
      })
    if (remote) {
      // No socket forwarding for other computers: poll the reduced
      // snapshot, quickly while an agent works, never while hidden. Herdr
      // status is checked first because the workspaces route would try to
      // start an offline Herdr on that computer.
      let timer: ReturnType<typeof setTimeout> | undefined
      let polling = false
      const poll = async () => {
        timer = undefined
        if (!current || polling || document.visibilityState !== 'visible')
          return
        polling = true
        try {
          const info = await api.getHerdrInfo()
          if (!current) return
          if (info.online !== true)
            publish({
              online: false,
              error: undefined,
              setup: await readSetup(),
            })
          else
            publish({
              online: true,
              error: undefined,
              setup: undefined,
              snapshot: snapshotFromWorkspaces(await api.getHerdrWorkspaces()),
            })
        } catch (reason) {
          if (current) publish({ online: false, error: messageOf(reason) })
        } finally {
          polling = false
        }
        if (current && document.visibilityState === 'visible')
          timer = setTimeout(poll, remotePollDelay(stateRef.current.snapshot))
      }
      const onVisibility = () => {
        if (document.visibilityState === 'visible' && !timer) void poll()
        else if (document.visibilityState !== 'visible' && timer) {
          clearTimeout(timer)
          timer = undefined
        }
      }
      document.addEventListener('visibilitychange', onVisibility)
      void poll()
      return () => {
        current = false
        if (timer) clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
    let socket: ReturnType<typeof api.openJsonSocket> | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    const connectHub = () => {
      if (!current || socket || reconnectTimer) return
      socket = api.openJsonSocket('/ws/herdr', (event) => {
        if (event.type === 'herdr') {
          const herdrOnline = event.online === true
          publish({
            online: herdrOnline,
            // Offline announcements carry the setup state (install/start
            // progress) so the page follows it without polling.
            setup: herdrOnline
              ? undefined
              : (parseHerdrSetup({
                  ...(event.setup as object),
                  online: false,
                }) ?? stateRef.current.setup),
          })
        }
        if (event.type === 'snapshot' && event.snapshot)
          publish({ snapshot: event.snapshot as HerdrSnapshot })
        if (event.type !== 'status' || !event.change) return
        const change = event.change as Record<string, string>
        const paneId = change.pane_id
        if (!paneId || !change.to) return
        const snapshot = stateRef.current.snapshot
        if (!snapshot?.panes) return
        publish({
          snapshot: {
            ...snapshot,
            panes: snapshot.panes.map((pane) =>
              pane.pane_id === paneId
                ? {
                    ...pane,
                    agent_status: change.to,
                    ...(change.title ? { title: change.title } : {}),
                    ...(change.agent ? { agent: change.agent } : {}),
                  }
                : pane,
            ),
          },
        })
      })
      const reconnect = () => {
        socket = undefined
        if (!current || reconnectTimer) return
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          connectHub()
        }, 1_000)
      }
      socket.onClose(reconnect)
      socket.opened.catch((reason) => {
        publish({ online: false, error: messageOf(reason) })
        reconnect()
      })
    }
    connectHub()
    return () => {
      current = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [
    api,
    desktopId,
    desktopName,
    online,
    publish,
    remote,
    retryToken,
    settingsRef,
  ])

  return null
}

export function HerdrProvider({
  desktops,
  notificationSettings,
  children,
}: {
  desktops: HandoffDesktop[]
  notificationSettings: NotificationSettings
  children: React.ReactNode
}) {
  const [byDesktop, setByDesktop] = useState<Record<string, DesktopHerdrState>>(
    {},
  )
  const [retryTokens, setRetryTokens] = useState<Record<string, number>>({})
  const [computersByDesktop, setComputersByDesktop] = useState<
    Record<string, HerdrComputer[] | undefined>
  >({})
  const [selectedByDesktop, setSelectedByDesktop] = useState<
    Record<string, string | null>
  >({})
  const settingsRef = useRef(notificationSettings)
  settingsRef.current = notificationSettings
  const onState = useCallback((desktopId: string, state: DesktopHerdrState) => {
    setByDesktop((current) => ({ ...current, [desktopId]: state }))
  }, [])
  const onComputers = useCallback(
    (desktopId: string, computers?: HerdrComputer[]) =>
      setComputersByDesktop((current) => ({
        ...current,
        [desktopId]: computers,
      })),
    [],
  )
  const selectedFor = useCallback(
    (desktopId: string) =>
      desktopId in selectedByDesktop
        ? selectedByDesktop[desktopId]
        : loadSelectedComputer(desktopId),
    [selectedByDesktop],
  )
  const computerFor = useCallback(
    (desktopId: string) =>
      effectiveComputer(computersByDesktop[desktopId], selectedFor(desktopId)),
    [computersByDesktop, selectedFor],
  )
  const value = useMemo<HerdrValue>(
    () => ({
      byDesktop,
      agents: (desktopId) =>
        agentListFromSnapshot(byDesktop[desktopId]?.snapshot),
      apiFor(desktopId) {
        return desktops
          .find((item) => item.id === desktopId)
          ?.api.forHerdrComputer(computerFor(desktopId))
      },
      computers: (desktopId) => computersByDesktop[desktopId],
      computerFor,
      selectComputer(desktopId, computerId) {
        saveSelectedComputer(desktopId, computerId)
        setSelectedByDesktop((current) => ({
          ...current,
          [desktopId]: computerId ?? null,
        }))
      },
      retry(desktopId) {
        setRetryTokens((current) => ({
          ...current,
          [desktopId]: (current[desktopId] ?? 0) + 1,
        }))
      },
      async setWorkspaceMuted(desktopId, workspaceId, muted) {
        const desktop = desktops.find((item) => item.id === desktopId)
        if (!desktop) return
        const result = await desktop.api
          .forHerdrComputer(computerFor(desktopId))
          .setHerdrWorkspaceMuted(workspaceId, muted)
        setByDesktop((current) => ({
          ...current,
          [desktopId]: {
            ...(current[desktopId] ?? {
              desktopOnline: desktop.online,
              online: false,
              supported: true,
            }),
            mutedWorkspaces: result.workspaces,
          },
        }))
      },
    }),
    [byDesktop, computerFor, computersByDesktop, desktops],
  )
  return (
    <HerdrContext.Provider value={value}>
      {desktops.map((desktop) => {
        const computerId = computerFor(desktop.id)
        return (
          <Fragment key={desktop.id}>
            <HerdrComputersSource
              desktop={desktop}
              retryToken={retryTokens[desktop.id] ?? 0}
              onComputers={onComputers}
            />
            {/* Keyed by computer: switching starts from an empty board and
                fresh notification baselines instead of mixing pane ids. */}
            <HerdrDesktopSource
              key={computerId ?? ''}
              desktop={desktop}
              api={desktop.api.forHerdrComputer(computerId)}
              settingsRef={settingsRef}
              onState={onState}
              retryToken={retryTokens[desktop.id] ?? 0}
            />
          </Fragment>
        )
      })}
      {children}
    </HerdrContext.Provider>
  )
}
