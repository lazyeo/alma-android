import {
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
  notificationTypeEnabled,
  scopedNotificationTag,
  showForegroundNotification,
  type NotificationSettings,
} from '../notifications'
import { desktopAgentPanePath } from '../desktopRoutes'
import {
  agentListFromSnapshot,
  shouldNotifyAgentStatus,
  type AgentWorkspaceModel,
  type HerdrPane,
  type HerdrSnapshot,
} from './model'

export interface DesktopHerdrState {
  desktopOnline: boolean
  online: boolean
  supported: boolean
  snapshot?: HerdrSnapshot
  mutedWorkspaces: string[]
  error?: string
}

interface HerdrValue {
  byDesktop: Record<string, DesktopHerdrState>
  agents(desktopId: string): AgentWorkspaceModel[]
  retry(desktopId: string): void
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
  desktopName,
  panes,
  mutedWorkspaces,
  pathname,
  enabled,
  notify = showForegroundNotification,
}: {
  desktopId: string
  desktopName: string
  panes: HerdrPane[]
  mutedWorkspaces: string[]
  pathname: string
  enabled: boolean
  notify?: typeof showForegroundNotification
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
      void notify({
        type: 'agent-needs-you',
        tag: scopedNotificationTag(desktopId, `agent:${pane.pane_id}:${to}`),
        url: desktopAgentPanePath(desktopId, pane.pane_id),
        threadTitle:
          pane.terminal_title_stripped || pane.title || pane.agent || undefined,
        desktopName,
      }).catch(() => undefined)
    }
    previous.current = next
  }, [
    desktopId,
    desktopName,
    enabled,
    mutedWorkspaces,
    notify,
    panes,
    pathname,
  ])
}

function HerdrDesktopSource({
  desktop,
  settingsRef,
  onState,
  retryToken,
}: {
  desktop: HandoffDesktop
  settingsRef: React.MutableRefObject<NotificationSettings>
  onState(desktopId: string, state: DesktopHerdrState): void
  retryToken: number
}) {
  const location = useLocation()
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname
  const stateRef = useRef<DesktopHerdrState>({
    desktopOnline: desktop.online,
    online: false,
    supported: true,
    mutedWorkspaces: [],
  })
  const { api, id: desktopId, name: desktopName, online } = desktop
  const notifySnapshot = useHerdrNotificationEvents({
    desktopId,
    desktopName,
    panes: stateRef.current.snapshot?.panes ?? [],
    mutedWorkspaces: stateRef.current.mutedWorkspaces,
    pathname: location.pathname,
    enabled: notificationTypeEnabled(settingsRef.current, 'agent-needs-you'),
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
    void Promise.all([api.getHerdrInfo(), api.getHerdrMutes()])
      .then(([info, mutes]) => {
        if (!current) return
        publish({
          online: info.online === true,
          supported: true,
          mutedWorkspaces: Array.isArray(mutes.workspaces)
            ? mutes.workspaces
            : [],
          error: undefined,
        })
      })
      .catch((reason) => {
        if (!current) return
        const status =
          reason && typeof reason === 'object' && 'status' in reason
            ? Number(reason.status)
            : 0
        publish({
          online: false,
          supported: [404, 405, 501].includes(status) ? false : true,
          error: [404, 405, 501].includes(status)
            ? undefined
            : reason instanceof Error
              ? reason.message
              : String(reason),
        })
      })
    let socket: ReturnType<typeof api.openJsonSocket> | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    const connectHub = () => {
      if (!current || socket || reconnectTimer) return
      socket = api.openJsonSocket('/ws/herdr', (event) => {
        if (event.type === 'herdr') publish({ online: event.online === true })
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
        publish({
          online: false,
          error: reason instanceof Error ? reason.message : String(reason),
        })
        reconnect()
      })
    }
    connectHub()
    return () => {
      current = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [api, desktopId, desktopName, online, publish, retryToken, settingsRef])

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
  const settingsRef = useRef(notificationSettings)
  settingsRef.current = notificationSettings
  const onState = useCallback((desktopId: string, state: DesktopHerdrState) => {
    setByDesktop((current) => ({ ...current, [desktopId]: state }))
  }, [])
  const value = useMemo<HerdrValue>(
    () => ({
      byDesktop,
      agents: (desktopId) =>
        agentListFromSnapshot(byDesktop[desktopId]?.snapshot),
      retry(desktopId) {
        setRetryTokens((current) => ({
          ...current,
          [desktopId]: (current[desktopId] ?? 0) + 1,
        }))
      },
      async setWorkspaceMuted(desktopId, workspaceId, muted) {
        const desktop = desktops.find((item) => item.id === desktopId)
        if (!desktop) return
        const result = await desktop.api.setHerdrWorkspaceMuted(
          workspaceId,
          muted,
        )
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
    [byDesktop, desktops],
  )
  return (
    <HerdrContext.Provider value={value}>
      {desktops.map((desktop) => (
        <HerdrDesktopSource
          key={desktop.id}
          desktop={desktop}
          settingsRef={settingsRef}
          onState={onState}
          retryToken={retryTokens[desktop.id] ?? 0}
        />
      ))}
      {children}
    </HerdrContext.Provider>
  )
}
