import {
  Archive,
  CircleCheck,
  Clock,
  Inbox,
  ListTodo,
  type LucideIcon,
} from 'lucide-react'
import type { Thread } from '../relay'
import { activityTime } from './projectGroups'
import { threadGtdStatus, type ThreadGtdStatus } from './threadGtd'
import { searchableThreads } from './threadListModel'
import { t } from '../i18n/runtime'

/** Visible tabs follow the left-to-right swipe pipeline. */
export const GTD_STATUS_ORDER: readonly ThreadGtdStatus[] = [
  'inbox',
  'todo',
  'in_progress',
  'done',
]

/** Status choices include Archived even though it has a separate entry. */
export const GTD_ALL_STATUSES: readonly ThreadGtdStatus[] = [
  ...GTD_STATUS_ORDER,
  'archived',
]

export const gtdStatusLabel = (status: ThreadGtdStatus) =>
  t(`gtd.status.${status}`)

/** Shared by status sheets and swipe reveals. */
export const GTD_STATUS_ICON: Record<ThreadGtdStatus, LucideIcon> = {
  inbox: Inbox,
  todo: ListTodo,
  in_progress: Clock,
  done: CircleCheck,
  archived: Archive,
}

/** Inbox rows older than this fold behind a single expandable row. */
export const INBOX_RECENT_MS = 7 * 24 * 60 * 60 * 1000

/** Session-scoped so a reload keeps the segment but a new launch starts at To-do. */
export const GTD_SEGMENT_STORAGE_KEY = 'alma-gtd-segment-v1'

type SegmentStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Desktop files a missing or unknown status under Inbox. */
export function gtdStatusOf(thread: Thread): ThreadGtdStatus {
  return threadGtdStatus(thread) ?? 'inbox'
}

/** GTD organizes the same rows the Threads list shows. */
export function gtdSourceThreads(threads: Thread[]) {
  return searchableThreads(threads)
}

const byRecency = (a: Thread, b: Thread) =>
  activityTime(b.updatedAt ?? b.createdAt) -
    activityTime(a.updatedAt ?? a.createdAt) || a.id.localeCompare(b.id)

export function gtdStatusCounts(threads: Thread[]) {
  const counts = Object.fromEntries(
    GTD_ALL_STATUSES.map((status) => [status, 0]),
  ) as Record<ThreadGtdStatus, number>
  for (const thread of threads) counts[gtdStatusOf(thread)] += 1
  return counts
}

export function threadsInStatus(threads: Thread[], status: ThreadGtdStatus) {
  return threads
    .filter((thread) => gtdStatusOf(thread) === status)
    .sort(byRecency)
}

/** Desktop's favorites order: pins by order desc, then recency, then id. */
export function favoriteGroups(threads: Thread[]) {
  const favorites = threads.filter((thread) => thread.isFavorited)
  return {
    pinned: favorites
      .filter((thread) => thread.isFavoritePinned)
      .sort(
        (a, b) =>
          (b.favoritePinnedOrder ?? 0) - (a.favoritePinnedOrder ?? 0) ||
          byRecency(a, b),
      ),
    favorites: favorites
      .filter((thread) => !thread.isFavoritePinned)
      .sort(byRecency),
  }
}

/** Inbox split at exactly 7×24h; threads without a usable time fold away. */
export function splitInbox(threads: Thread[], now: number) {
  const sorted = [...threads].sort(byRecency)
  const cutoff = now - INBOX_RECENT_MS
  const isRecent = (thread: Thread) => {
    const time = activityTime(thread.updatedAt ?? thread.createdAt)
    return time > 0 && time >= cutoff
  }
  return {
    recent: sorted.filter(isRecent),
    older: sorted.filter((thread) => !isRecent(thread)),
  }
}

export function loadGtdSegment(storage: SegmentStorage): ThreadGtdStatus {
  try {
    const value = storage.getItem(GTD_SEGMENT_STORAGE_KEY)
    return GTD_ALL_STATUSES.find((status) => status === value) ?? 'todo'
  } catch {
    return 'todo'
  }
}

export function saveGtdSegment(
  storage: SegmentStorage,
  status: ThreadGtdStatus,
) {
  try {
    storage.setItem(GTD_SEGMENT_STORAGE_KEY, status)
  } catch {
    // Storage can be unavailable (private mode); the segment then lasts
    // only as long as the mounted page.
  }
}
