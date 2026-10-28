import type { MessageRow, Thread } from '../relay'

export type ThreadGtdStatus =
  'inbox' | 'todo' | 'in_progress' | 'done' | 'archived'

export interface AutoTodo {
  what: string
  quote: string
  at: string | number
}

const statuses = new Set<ThreadGtdStatus>([
  'inbox',
  'todo',
  'in_progress',
  'done',
  'archived',
])

export function threadGtdStatus(thread: Thread) {
  const status = thread.metadata?.gtdStatus
  return typeof status === 'string' && statuses.has(status as ThreadGtdStatus)
    ? (status as ThreadGtdStatus)
    : undefined
}

export function isTodoThread(thread: Thread) {
  const status = threadGtdStatus(thread)
  return status === 'todo' || status === 'in_progress'
}

export function autoTodo(thread: Thread): AutoTodo | undefined {
  const value = thread.metadata?.autoTodo
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (
    typeof row.what !== 'string' ||
    !row.what.trim() ||
    typeof row.quote !== 'string' ||
    !row.quote.trim() ||
    (typeof row.at !== 'string' && typeof row.at !== 'number')
  )
    return undefined
  return { what: row.what, quote: row.quote, at: row.at }
}

function rowText(row: MessageRow) {
  return row.message.parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

function timestamp(value: string | number | undefined) {
  if (typeof value === 'number') return value
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

export function findAutoTodoMessage(rows: MessageRow[], todo: AutoTodo) {
  const quote = todo.quote.trim().toLocaleLowerCase()
  const at = timestamp(todo.at)
  return rows
    .filter(
      (row) =>
        row.message.role === 'user' &&
        rowText(row).toLocaleLowerCase().includes(quote),
    )
    .sort(
      (a, b) =>
        Math.abs(timestamp(a.timestamp ?? a.createdAt) - at) -
        Math.abs(timestamp(b.timestamp ?? b.createdAt) - at),
    )[0]
}

/**
 * Desktop organizes threads without bumping `updatedAt` (its GTD and favorite
 * handlers send `skipUpdatedAt: true`, which the PUT handler honors), so a
 * status or favorite change never reorders recency lists.
 */
export type ThreadOrganizeUpdate = {
  metadata?: Record<string, unknown>
  isFavorited?: boolean
  isFavoritePinned?: boolean
  favoritePinnedOrder?: number | null
  skipUpdatedAt: true
}

export function gtdStatusUpdate(
  thread: Thread,
  status: ThreadGtdStatus,
): ThreadOrganizeUpdate {
  return {
    metadata: { ...(thread.metadata ?? {}), gtdStatus: status },
    skipUpdatedAt: true,
  }
}

/** Un-favoriting also clears the pin, exactly like Desktop. */
export function favoriteUpdate(
  _thread: Thread,
  favorited: boolean,
): ThreadOrganizeUpdate {
  return favorited
    ? { isFavorited: true, skipUpdatedAt: true }
    : {
        isFavorited: false,
        isFavoritePinned: false,
        favoritePinnedOrder: null,
        skipUpdatedAt: true,
      }
}

/** A new pin goes above every current pin: max pinned order + 1. */
export function favoritePinUpdate(
  _thread: Thread,
  threads: Thread[],
  pinned: boolean,
): ThreadOrganizeUpdate {
  if (!pinned)
    return {
      isFavoritePinned: false,
      favoritePinnedOrder: null,
      skipUpdatedAt: true,
    }
  const maxOrder = threads.reduce(
    (max, row) =>
      row.isFavorited && row.isFavoritePinned
        ? Math.max(max, row.favoritePinnedOrder ?? 0)
        : max,
    0,
  )
  return {
    isFavoritePinned: true,
    favoritePinnedOrder: maxOrder + 1,
    skipUpdatedAt: true,
  }
}

/** Optimistic local copy: the control flag is not a thread field. */
export function applyThreadUpdate(
  thread: Thread,
  update: ThreadOrganizeUpdate,
): Thread {
  const { skipUpdatedAt: _skip, ...fields } = update
  return { ...thread, ...fields }
}

/**
 * Undo a failed optimistic write field by field, so realtime changes to
 * other fields that landed meanwhile survive the rollback.
 */
export function rollbackThreadUpdate(
  current: Thread,
  before: Thread,
  update: ThreadOrganizeUpdate,
): Thread {
  const restored: Thread = { ...current }
  for (const key of Object.keys(update)) {
    if (key === 'skipUpdatedAt') continue
    if (key in before) restored[key] = before[key]
    else delete restored[key]
  }
  return restored
}
