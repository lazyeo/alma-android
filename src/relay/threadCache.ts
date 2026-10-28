import type {
  AlmaSettings,
  MessageRow,
  ReasoningEffort,
  Thread,
  Workspace,
} from './almaApi'

const THREAD_LIST_VERSION = 1
const THREAD_LIST_PREFIX = 'alma-mobile.thread-list.v1:'
const MAX_PERSISTED_LIST_BYTES = 512_000

export interface ThreadCacheStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface CachedThread {
  rows: MessageRow[]
  title: string
  workspaceId: string
  model: string
  reasoningEffort: 'off' | ReasoningEffort
  fastMode: boolean | null
  isGeneratingTitle: boolean
}

export interface CachedThreadList {
  threads: Thread[]
  workspaces: Workspace[]
  settings: AlmaSettings
}

interface PersistedThreadList {
  version: typeof THREAD_LIST_VERSION
  threads: Thread[]
  workspaces: Workspace[]
}

const threadKey = (desktopId: string, threadId: string) =>
  `${desktopId}:${threadId}`
const listKey = (desktopId: string) => `${THREAD_LIST_PREFIX}${desktopId}`

const validRows = (value: unknown): value is unknown[] => Array.isArray(value)

export function createThreadCache(maxThreads = 20) {
  const threads = new Map<string, CachedThread>()
  const lists = new Map<string, CachedThreadList>()

  return {
    getThread(desktopId: string, threadId: string) {
      const key = threadKey(desktopId, threadId)
      const cached = threads.get(key)
      if (!cached) return undefined
      threads.delete(key)
      threads.set(key, cached)
      return cached
    },
    setThread(desktopId: string, threadId: string, value: CachedThread) {
      const key = threadKey(desktopId, threadId)
      threads.delete(key)
      threads.set(key, value)
      while (threads.size > maxThreads) {
        const oldest = threads.keys().next().value
        if (oldest === undefined) break
        threads.delete(oldest)
      }
    },
    evictThread(desktopId: string, threadId: string) {
      threads.delete(threadKey(desktopId, threadId))
    },
    getThreadList(desktopId: string) {
      return lists.get(desktopId)
    },
    setThreadList(desktopId: string, value: CachedThreadList) {
      lists.set(desktopId, value)
    },
    clearDesktop(desktopId: string) {
      lists.delete(desktopId)
      const prefix = `${desktopId}:`
      for (const key of threads.keys())
        if (key.startsWith(prefix)) threads.delete(key)
    },
  }
}

export type ThreadCache = ReturnType<typeof createThreadCache>
export const threadCache = createThreadCache()

export function loadPersistedThreadList(
  storage: Pick<ThreadCacheStorage, 'getItem'>,
  desktopId: string,
): Pick<CachedThreadList, 'threads' | 'workspaces'> | undefined {
  try {
    const raw = storage.getItem(listKey(desktopId))
    if (!raw || raw.length > MAX_PERSISTED_LIST_BYTES) return undefined
    const parsed = JSON.parse(raw) as Partial<PersistedThreadList>
    if (
      parsed.version !== THREAD_LIST_VERSION ||
      !validRows(parsed.threads) ||
      !validRows(parsed.workspaces)
    )
      return undefined
    return {
      threads: parsed.threads as Thread[],
      workspaces: parsed.workspaces as Workspace[],
    }
  } catch {
    return undefined
  }
}

export function persistThreadList(
  storage: Pick<ThreadCacheStorage, 'setItem'>,
  desktopId: string,
  threads: Thread[],
  workspaces: Workspace[],
) {
  try {
    const value = JSON.stringify({
      version: THREAD_LIST_VERSION,
      threads,
      workspaces,
    } satisfies PersistedThreadList)
    if (value.length <= MAX_PERSISTED_LIST_BYTES)
      storage.setItem(listKey(desktopId), value)
  } catch {
    // Memory cache remains available when persistent storage is unavailable.
  }
}

export function initialThreadListState(
  desktopId: string,
  storage: Pick<ThreadCacheStorage, 'getItem'>,
  cache: ThreadCache = threadCache,
) {
  const memory = cache.getThreadList(desktopId)
  if (memory) return { ...memory, loading: false }
  const persisted = loadPersistedThreadList(storage, desktopId)
  if (persisted)
    return { ...persisted, settings: {} as AlmaSettings, loading: false }
  return {
    threads: [] as Thread[],
    workspaces: [] as Workspace[],
    settings: {} as AlmaSettings,
    loading: true,
  }
}

export function clearDesktopThreadCache(
  desktopId: string,
  storage: Pick<ThreadCacheStorage, 'removeItem'> = localStorage,
  cache: ThreadCache = threadCache,
) {
  cache.clearDesktop(desktopId)
  try {
    storage.removeItem(listKey(desktopId))
  } catch {
    // Pairing removal still succeeds when persistent storage is unavailable.
  }
}
