import {
  ExtensionNotifications,
  useNotificationSuppression,
  useDesktopEventHook,
} from '../extensions'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  isUnsupportedEndpoint,
  type AlmaApi,
  type ApprovalRequest,
  type ApprovalSocketEvent,
  type QuestionRequest,
  type QuestionSocketEvent,
  type Thread,
} from '../relay'
import {
  currentNotificationPermission,
  isViewingThread,
  loadNotificationSettings,
  notificationTypeEnabled,
  requestAppNotificationPermission,
  saveNotificationSettings,
  scopedNotificationTag,
  setApplicationBadge,
  showForegroundNotification,
  type AppNotificationPermission,
  type NotificationSettings,
} from '../notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativePlatform, notificationDestination } from '../nativeRuntime'
import { desktopThreadPath } from '../desktopRoutes'
import {
  aggregateDesktopHandoff,
  handoffCount,
  notificationTarget,
  resolveHandoffList,
  shouldNotifyRequest,
  type DesktopApprovalRequest,
  type DesktopQuestionRequest,
} from '../screens/inboxModel'
import { createDesktopWatch } from './desktopWatch'
import { useThreadActivityPublisher } from '../desktops/ThreadActivityProvider'
// Runtime `t`: titles and errors are stored as state when produced.
import { t, useLanguage } from '../i18n'

export type HandoffDesktop = {
  id: string
  name: string
  api: AlmaApi
  /** Sockets and polling run only while the desktop's tunnel is up. */
  online: boolean
}

type DesktopHandoffState = {
  approvals: ApprovalRequest[]
  questions: QuestionRequest[]
  threadTitles: Record<string, string>
  threads: Thread[]
  error: string
  /** False once the desktop answers 404/405/501 for both handoff routes. */
  supported: boolean
}

export type DesktopHandoffStatus = {
  desktopId: string
  desktopName: string
  error: string
  supported: boolean
}

type HandoffValue = {
  approvals: DesktopApprovalRequest[]
  questions: DesktopQuestionRequest[]
  /** Thread titles keyed by desktop id, then thread id. */
  threadTitles: Record<string, Record<string, string>>
  /** Thread lists already loaded by each desktop's background watcher. */
  threads: Record<string, Thread[]>
  count: number
  desktopStatuses: DesktopHandoffStatus[]
  notificationSettings: NotificationSettings
  permission: AppNotificationPermission
  refresh(): Promise<void>
  respondApproval(
    request: DesktopApprovalRequest,
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_with_reason',
    reason?: string,
  ): Promise<void>
  respondQuestion(
    request: DesktopQuestionRequest,
    action: 'accept' | 'decline' | 'cancel',
    answers?: Array<{ selected: string[]; custom?: string }>,
  ): Promise<void>
  updateNotificationSettings(settings: NotificationSettings): void
  requestNotificationPermission(): Promise<void>
}

const HandoffContext = createContext<HandoffValue | null>(null)

export function useHandoff() {
  const value = useContext(HandoffContext)
  if (!value) throw new Error('useHandoff requires HandoffProvider')
  return value
}

function titlesFromThreads(threads: Thread[]) {
  return Object.fromEntries(
    threads.map((thread) => [thread.id, thread.title || t('handoff.untitled')]),
  )
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

/**
 * Background watcher for one desktop: handoff sockets, `/ws/threads` for
 * titles and generation-complete alerts, and a polling fallback. It renders
 * nothing so every paired desktop can run one regardless of which is active.
 */
function DesktopHandoffSource({
  desktop,
  settingsRef,
  onState,
  registerRefresh,
}: {
  desktop: HandoffDesktop
  settingsRef: React.MutableRefObject<NotificationSettings>
  onState(desktopId: string, state: DesktopHandoffState): void
  registerRefresh(desktopId: string, refresh?: () => Promise<void>): void
}) {
  const suppress = useNotificationSuppression()
  const pushConfig = useRef(suppress)
  pushConfig.current = suppress
  const onEvent = useDesktopEventHook(desktop.id)
  const eventRef = useRef(onEvent)
  eventRef.current = onEvent
  const { id: desktopId, api, online } = desktop
  const onlineRef = useRef(online)
  onlineRef.current = online
  const watchRef = useRef<ReturnType<typeof createDesktopWatch>>()
  const initialized = useRef(false)
  const knownRequestIds = useRef(new Set<string>())
  const titles = useRef<Record<string, string>>({})
  const desktopName = useRef(desktop.name)
  desktopName.current = desktop.name
  const supported = useRef({ approvals: true, questions: true })
  const { publish: publishThreadEvent, reset: resetThreadActivity } =
    useThreadActivityPublisher()

  const notifyRequest = useCallback(
    async (
      type: 'approval' | 'question',
      request: ApprovalRequest | QuestionRequest,
    ) => {
      if (
        pushConfig.current(desktopId) ||
        !notificationTypeEnabled(settingsRef.current, type)
      )
        return
      await showForegroundNotification({
        type,
        tag: scopedNotificationTag(desktopId, request.requestId),
        url: notificationTarget({ ...request, desktopId }),
        threadTitle: request.threadId
          ? titles.current[request.threadId]
          : undefined,
        desktopName: desktopName.current,
      }).catch(() => undefined)
    },
    [desktopId, settingsRef],
  )

  const refresh = useCallback(async () => {
    const [approvalResult, questionResult, threadResult] =
      await Promise.allSettled([
        supported.current.approvals ? api.listApprovals() : Promise.resolve([]),
        supported.current.questions ? api.listQuestions() : Promise.resolve([]),
        api.listThreads(),
      ])
    const approvalList = resolveHandoffList(approvalResult)
    const questionList = resolveHandoffList(questionResult)
    supported.current = {
      approvals: supported.current.approvals && approvalList.supported,
      questions: supported.current.questions && questionList.supported,
    }
    const nextApprovals = approvalList.items
    const nextQuestions = questionList.items
    const nextTitles =
      threadResult.status === 'fulfilled'
        ? titlesFromThreads(threadResult.value)
        : { ...titles.current }
    const missingIds = [
      ...new Set(
        [...nextApprovals, ...nextQuestions]
          .map((request) => request.threadId)
          .filter(
            (threadId): threadId is string =>
              Boolean(threadId) && !nextTitles[threadId!],
          ),
      ),
    ]
    const missing = await Promise.all(
      missingIds.map((id) => api.getThread(id).catch(() => null)),
    )
    for (const thread of missing) {
      if (thread) nextTitles[thread.id] = thread.title || t('handoff.untitled')
    }
    titles.current = nextTitles

    for (const request of nextApprovals) {
      if (
        shouldNotifyRequest(
          initialized.current,
          knownRequestIds.current,
          request,
        )
      )
        void notifyRequest('approval', request)
    }
    for (const request of nextQuestions) {
      if (
        shouldNotifyRequest(
          initialized.current,
          knownRequestIds.current,
          request,
        )
      )
        void notifyRequest('question', request)
    }
    knownRequestIds.current = new Set(
      [...nextApprovals, ...nextQuestions].map((request) => request.requestId),
    )
    initialized.current = true
    onState(desktopId, {
      approvals: nextApprovals,
      questions: nextQuestions,
      threadTitles: nextTitles,
      threads: threadResult.status === 'fulfilled' ? threadResult.value : [],
      error:
        approvalList.error ||
        questionList.error ||
        (threadResult.status === 'rejected'
          ? errorMessage(threadResult.reason, t('handoff.loadThreadsFailed'))
          : ''),
      supported: supported.current.approvals || supported.current.questions,
    })
  }, [api, desktopId, notifyRequest, onState])

  useEffect(() => {
    registerRefresh(desktopId, refresh)
    return () => registerRefresh(desktopId, undefined)
  }, [desktopId, refresh, registerRefresh])

  useEffect(() => {
    const openHandoffSocket = (path: string, type: 'approval' | 'question') => {
      const socket = api.openJsonSocket(path, (event) => {
        const handoff = event as unknown as
          ApprovalSocketEvent | QuestionSocketEvent
        if (
          handoff.type === 'show' &&
          shouldNotifyRequest(
            initialized.current,
            knownRequestIds.current,
            handoff.request,
          )
        ) {
          knownRequestIds.current.add(handoff.request.requestId)
          void notifyRequest(type, handoff.request)
        }
        void refresh()
      })
      // Older desktops reject unknown socket paths; polling still covers them.
      socket.opened.catch(() => undefined)
      return socket
    }
    const openSockets = () => {
      const approvalSocket = openHandoffSocket(
        '/ws/handoff/tool-approvals',
        'approval',
      )
      const questionSocket = openHandoffSocket(
        '/ws/handoff/user-questions',
        'question',
      )
      // This is the desktop's only background `/ws/threads`; screens read
      // generating status and list events from it via the activity hub.
      const threadSocket = api.threadsSocket((event) => {
        publishThreadEvent(desktopId, event)
        eventRef.current(event)
        if (
          event.type === 'thread_updated' ||
          event.type === 'title_generated'
        ) {
          const id = event.data?.id
          const title = event.data?.title
          if (typeof id === 'string' && typeof title === 'string')
            titles.current = { ...titles.current, [id]: title }
        }
        if (
          event.type === 'generation_completed' &&
          !pushConfig.current(desktopId) &&
          notificationTypeEnabled(settingsRef.current, 'generation-complete')
        ) {
          const threadId = event.data?.threadId
          // The reply is already on screen; only alert from elsewhere.
          const watching =
            typeof threadId === 'string' &&
            document.visibilityState === 'visible' &&
            isViewingThread(window.location.pathname, desktopId, threadId)
          if (typeof threadId === 'string' && !watching) {
            void showForegroundNotification({
              type: 'generation-complete',
              tag: scopedNotificationTag(
                desktopId,
                `generation-complete:${threadId}`,
              ),
              url: desktopThreadPath(desktopId, threadId),
              threadTitle: titles.current[threadId],
              desktopName: desktopName.current,
            }).catch(() => undefined)
          }
        }
      })
      threadSocket.opened.catch(() => undefined)
      return [approvalSocket, questionSocket, threadSocket]
    }
    const watch = createDesktopWatch({ refresh, openSockets, pollMs: 5000 })
    watchRef.current = watch
    watch.setOnline(onlineRef.current)
    return () => {
      watchRef.current = undefined
      watch.close()
      resetThreadActivity(desktopId)
    }
  }, [
    api,
    desktopId,
    notifyRequest,
    refresh,
    settingsRef,
    publishThreadEvent,
    resetThreadActivity,
  ])

  useEffect(() => {
    watchRef.current?.setOnline(online)
    // The socket closes with the tunnel; a fresh snapshot arrives on return.
    if (!online) resetThreadActivity(desktopId)
  }, [online, desktopId, resetThreadActivity])

  return null
}

export function HandoffProvider({
  desktops,
  children,
}: {
  desktops: HandoffDesktop[]
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const [byDesktop, setByDesktop] = useState<
    Record<string, DesktopHandoffState>
  >({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const [notificationSettings, setNotificationSettings] = useState(() =>
    loadNotificationSettings(),
  )
  const [permission, setPermission] =
    useState<AppNotificationPermission>('default')
  const latestSettings = useRef(notificationSettings)
  const refreshers = useRef(new Map<string, () => Promise<void>>())
  const { language } = useLanguage()

  // Recreating a channel with the same id renames it in system settings.
  useEffect(() => {
    if (!isNativePlatform()) return
    void LocalNotifications.createChannel({
      id: 'alma-foreground',
      name: t('notifications.channel.name'),
      description: t('notifications.channel.description'),
      importance: 4,
      visibility: 1,
      vibration: true,
    })
  }, [language])

  useEffect(() => {
    void currentNotificationPermission().then(setPermission)
    if (!isNativePlatform()) return
    const listener = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      ({ notification }) => {
        navigate(notificationDestination(notification.extra?.url))
      },
    )
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [navigate])

  useEffect(() => {
    latestSettings.current = notificationSettings
  }, [notificationSettings])

  const onState = useCallback(
    (desktopId: string, state: DesktopHandoffState) =>
      setByDesktop((current) => ({ ...current, [desktopId]: state })),
    [],
  )
  const registerRefresh = useCallback(
    (desktopId: string, refresh?: () => Promise<void>) => {
      if (refresh) refreshers.current.set(desktopId, refresh)
      else refreshers.current.delete(desktopId)
    },
    [],
  )

  // Only currently paired desktops contribute; removed desktops drop out.
  const aggregate = useMemo(() => {
    const present = desktops.map((desktop) => ({
      desktop,
      state: byDesktop[desktop.id],
    }))
    const { approvals, questions } = aggregateDesktopHandoff(
      present.map(({ desktop, state }) => ({
        desktopId: desktop.id,
        desktopName: desktop.name,
        approvals: state?.approvals ?? [],
        questions: state?.questions ?? [],
      })),
    )
    return {
      approvals,
      questions,
      threadTitles: Object.fromEntries(
        present.map(({ desktop, state }) => [
          desktop.id,
          state?.threadTitles ?? {},
        ]),
      ),
      threads: Object.fromEntries(
        present.map(({ desktop, state }) => [desktop.id, state?.threads ?? []]),
      ),
      desktopStatuses: present.map(({ desktop, state }) => ({
        desktopId: desktop.id,
        desktopName: desktop.name,
        error: actionErrors[desktop.id] || state?.error || '',
        supported: state?.supported ?? true,
      })),
    }
  }, [desktops, byDesktop, actionErrors])

  const count = handoffCount(aggregate.approvals, aggregate.questions)
  useEffect(() => {
    void setApplicationBadge(count)
  }, [count])

  useEffect(() => {
    const onMessage = (
      event: MessageEvent<{ type?: string; url?: string }>,
    ) => {
      if (event.data?.type === 'notification-click' && event.data.url) {
        navigate(notificationDestination(event.data.url))
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () =>
      navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [navigate])

  const value = useMemo<HandoffValue>(() => {
    // Responses go to the desktop that raised the request, never the active one.
    const respond = async (
      desktopId: string,
      send: (api: AlmaApi) => Promise<unknown>,
    ) => {
      const desktop = desktops.find((item) => item.id === desktopId)
      if (!desktop) return
      try {
        await send(desktop.api)
        setActionErrors(({ [desktopId]: _, ...rest }) => rest)
      } catch (error) {
        setActionErrors((current) => ({
          ...current,
          [desktopId]: isUnsupportedEndpoint(error)
            ? t('handoff.respondUnsupported', { desktop: desktop.name })
            : errorMessage(error, t('handoff.respondFailed')),
        }))
      }
      await refreshers.current.get(desktopId)?.()
    }
    return {
      ...aggregate,
      count,
      notificationSettings,
      permission,
      async refresh() {
        await Promise.all(
          [...refreshers.current.values()].map((refresh) => refresh()),
        )
      },
      respondApproval(request, action, reason) {
        return respond(request.desktopId, (api) =>
          api.respondApproval(
            request.requestId,
            action,
            reason?.trim() || undefined,
          ),
        )
      },
      respondQuestion(request, action, answers = []) {
        return respond(request.desktopId, (api) =>
          api.respondQuestion(request.requestId, action, answers),
        )
      },
      updateNotificationSettings(settings) {
        setNotificationSettings(settings)
        saveNotificationSettings(settings)
      },
      async requestNotificationPermission() {
        setPermission(await requestAppNotificationPermission())
      },
    }
  }, [aggregate, count, desktops, notificationSettings, permission])

  return (
    <HandoffContext.Provider value={value}>
      <ExtensionNotifications
        preferences={notificationSettings}
        onPermissionGranted={() => setPermission('granted')}
      />
      {desktops.map((desktop) => (
        <DesktopHandoffSource
          key={desktop.id}
          desktop={desktop}
          settingsRef={latestSettings}
          onState={onState}
          registerRefresh={registerRefresh}
        />
      ))}
      {children}
    </HandoffContext.Provider>
  )
}
