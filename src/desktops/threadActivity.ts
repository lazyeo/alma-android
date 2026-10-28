import type { RealtimeEvent } from '../relay'

type ThreadEvent = Pick<RealtimeEvent, 'type' | 'data'>

const FINISHED = new Set([
  'generation_completed',
  'generation_error',
  'generation_stopped',
])

// Desktop keys `thread_generating` by `id`; older builds used `threadId`.
const generatingId = (data: any): string | undefined => {
  const id = data?.id ?? data?.threadId
  return typeof id === 'string' ? id : undefined
}

/**
 * Generating thread ids for one desktop. Returns the same set when an event
 * changes nothing so state updates can bail out.
 */
export function reduceGeneratingIds(
  ids: ReadonlySet<string>,
  event: ThreadEvent,
): ReadonlySet<string> {
  const { type, data } = event
  if (type === 'generating_snapshot') {
    const next = new Set<string>(
      Array.isArray(data?.ids)
        ? data.ids.filter((id: unknown) => typeof id === 'string')
        : [],
    )
    const same = next.size === ids.size && [...next].every((id) => ids.has(id))
    return same ? ids : next
  }
  let id: string | undefined
  let generating = false
  if (type === 'thread_generating') {
    id = generatingId(data)
    generating = data?.isGenerating === true
  } else if (FINISHED.has(type)) {
    id = typeof data?.threadId === 'string' ? data.threadId : undefined
  } else if (type === 'thread_deleted') {
    id = typeof data?.id === 'string' ? data.id : undefined
  }
  if (!id || ids.has(id) === generating) return ids
  const next = new Set(ids)
  if (generating) next.add(id)
  else next.delete(id)
  return next
}

/** How an event changes one thread's generating flag (undefined: no change). */
export function generatingChange(
  threadId: string,
  event: ThreadEvent,
): boolean | undefined {
  if (reduceGeneratingIds(new Set(), event).has(threadId)) return true
  if (!reduceGeneratingIds(new Set([threadId]), event).has(threadId))
    return false
  return undefined
}

export type ThreadEventListener = (event: RealtimeEvent) => void

/**
 * Fans each desktop's single background `/ws/threads` stream out to screens,
 * so lists never open a second socket of their own.
 */
export class ThreadEventHub {
  private listeners = new Map<string, Set<ThreadEventListener>>()

  subscribe(desktopId: string, listener: ThreadEventListener) {
    const set = this.listeners.get(desktopId) ?? new Set()
    set.add(listener)
    this.listeners.set(desktopId, set)
    return () => {
      set.delete(listener)
      if (!set.size) this.listeners.delete(desktopId)
    }
  }

  publish(desktopId: string, event: RealtimeEvent) {
    for (const listener of [...(this.listeners.get(desktopId) ?? [])]) {
      try {
        listener(event)
      } catch (error) {
        console.error('Thread event listener failed', error)
      }
    }
  }
}
