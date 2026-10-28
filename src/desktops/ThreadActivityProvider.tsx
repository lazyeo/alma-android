import {
  completeUnread,
  parseUnreadStore,
  readUnread,
  reconcileUnread,
  type UnreadState,
} from '../screens/threadUnread'
import type { Thread } from '../relay'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeEvent } from '../relay'
import {
  ThreadEventHub,
  reduceGeneratingIds,
  type ThreadEventListener,
} from './threadActivity'

type ThreadActivityValue = {
  generating: Record<string, ReadonlySet<string>>
  unread: Record<string, UnreadState>
  seed(desktopId: string, threads: Thread[]): void
  markRead(desktopId: string, threadId: string): void
  setOpenThread(desktopId: string, threadId?: string): void
  hub: ThreadEventHub
  publish(desktopId: string, event: RealtimeEvent): void
  /** The desktop's socket closed; its generating ids are no longer known. */
  reset(desktopId: string): void
}

const ThreadActivityContext = createContext<ThreadActivityValue | null>(null)
const NONE: ReadonlySet<string> = new Set()

const useThreadActivity = () => {
  const value = useContext(ThreadActivityContext)
  if (!value)
    throw new Error('useThreadActivity requires ThreadActivityProvider')
  return value
}

/**
 * Owns live thread status for every paired desktop. The handoff watcher
 * publishes its background `/ws/threads` events here, so status survives
 * screen changes and lists never need a socket of their own.
 */
export function ThreadActivityProvider({ children }: { children: ReactNode }) {
  const openThreads = useRef<Record<string, string | undefined>>({})
  const setOpenThread = useCallback((desktopId: string, threadId?: string) => {
    openThreads.current[desktopId] = threadId
  }, [])
  const hub = useMemo(() => new ThreadEventHub(), [])
  const [generating, setGenerating] = useState<
    Record<string, ReadonlySet<string>>
  >({})
  const [unread, setUnread] = useState<Record<string, UnreadState>>(() => {
    try {
      return parseUnreadStore(localStorage.getItem('alma-unread-v1') || '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('alma-unread-v1', JSON.stringify(unread))
    } catch {
      /* storage unavailable */
    }
  }, [unread])
  const seed = useCallback(
    (desktopId: string, threads: Thread[]) =>
      setUnread((current) => ({
        ...current,
        [desktopId]: reconcileUnread(current[desktopId] ?? {}, threads),
      })),
    [],
  )
  const markRead = useCallback(
    (desktopId: string, threadId: string) =>
      setUnread((current) => {
        return {
          ...current,
          [desktopId]: readUnread(
            current[desktopId] ?? {},
            threadId,
            Date.now(),
          ),
        }
      }),
    [],
  )
  const publish = useCallback(
    (desktopId: string, event: RealtimeEvent) => {
      setGenerating((current) => {
        const before = current[desktopId] ?? NONE
        const after = reduceGeneratingIds(before, event)
        return after === before ? current : { ...current, [desktopId]: after }
      })
      if (
        event.type === 'generation_completed' &&
        typeof event.data?.threadId === 'string'
      ) {
        const completedAt = event.timestamp ?? Date.now()
        const openAndVisible =
          openThreads.current[desktopId] === event.data.threadId &&
          document.visibilityState === 'visible'
        setUnread((current) => ({
          ...current,
          [desktopId]: completeUnread(
            current[desktopId] ?? {},
            event.data.threadId,
            completedAt,
            openAndVisible,
          ),
        }))
      }
      hub.publish(desktopId, event)
    },
    [hub],
  )
  const reset = useCallback(
    (desktopId: string) => setGenerating(({ [desktopId]: _, ...rest }) => rest),
    [],
  )
  const value = useMemo(
    () => ({
      generating,
      unread,
      seed,
      markRead,
      setOpenThread,
      hub,
      publish,
      reset,
    }),
    [generating, unread, seed, markRead, setOpenThread, hub, publish, reset],
  )
  return (
    <ThreadActivityContext.Provider value={value}>
      {children}
    </ThreadActivityContext.Provider>
  )
}

export const useThreadActivityPublisher = () => {
  const { publish, reset } = useThreadActivity()
  return { publish, reset }
}

export const useGeneratingIds = (desktopId: string) =>
  useThreadActivity().generating[desktopId] ?? NONE

/** Subscribes to one desktop's shared `/ws/threads` events. */
export function useDesktopThreadEvents(
  desktopId: string,
  listener: ThreadEventListener,
) {
  const { hub } = useThreadActivity()
  const latest = useRef(listener)
  latest.current = listener
  useEffect(
    () => hub.subscribe(desktopId, (event) => latest.current(event)),
    [hub, desktopId],
  )
}

export const useUnreadActivity = () => {
  const { unread, seed, markRead, setOpenThread } = useThreadActivity()
  return { unread, seed, markRead, setOpenThread }
}
