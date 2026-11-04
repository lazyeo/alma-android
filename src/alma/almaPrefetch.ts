import type { MessageRow, Thread } from '../relay/almaApi'
import { threadCache, type ThreadCache } from '../relay/threadCache'

/** Rows newer than this are good enough for the expand's first frame. */
export const PREFETCH_MAX_AGE_MS = 30_000

interface ThreadSource {
  getThread(id: string): Promise<Thread>
  getMessages(id: string): Promise<MessageRow[]>
}

const inflight = new Map<string, Promise<void>>()
const fetchedAt = new Map<string, number>()

export function resetAlmaPrefetch() {
  inflight.clear()
  fetchedAt.clear()
}

/**
 * Warms the thread cache with Alma's main thread before the tap navigates,
 * so the expand's shell already has her latest messages. Called on idle
 * and again on pointer-down; concurrent and recent calls are free.
 */
export function prefetchAlmaThread(
  api: ThreadSource | undefined,
  desktopId: string,
  threadId: string,
  {
    fallbackTitle = '',
    cache = threadCache,
    clock = Date.now,
  }: { fallbackTitle?: string; cache?: ThreadCache; clock?: () => number } = {},
): Promise<void> {
  const key = `${desktopId}:${threadId}`
  const pending = inflight.get(key)
  if (pending) return pending
  if (!api) return Promise.resolve()
  const last = fetchedAt.get(key)
  if (
    last !== undefined &&
    clock() - last < PREFETCH_MAX_AGE_MS &&
    cache.getThread(desktopId, threadId)
  )
    return Promise.resolve()
  const request = (async () => {
    try {
      const thread = await api.getThread(threadId)
      const rows = Array.isArray(thread.messages)
        ? thread.messages
        : await api.getMessages(threadId)
      const cached = cache.getThread(desktopId, threadId)
      cache.setThread(desktopId, threadId, {
        rows,
        title: thread.title || cached?.title || fallbackTitle,
        workspaceId: thread.workspaceId ?? cached?.workspaceId ?? '',
        model: thread.model ?? cached?.model ?? '',
        reasoningEffort:
          thread.reasoningEffort ?? cached?.reasoningEffort ?? 'medium',
        fastMode: thread.fastMode ?? cached?.fastMode ?? null,
        isGeneratingTitle: Boolean(thread.isGeneratingTitle),
      })
      fetchedAt.set(key, clock())
    } catch {
      // The screen loads the thread itself; a failed warm-up costs nothing.
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, request)
  return request
}
