import type { Thread } from '../relay'
import { activityTime } from './projectGroups'

/** Matches the desktop and official app project cards. */
export const PROJECT_RECENT_LIMIT = 5

const threadActivity = (thread: Thread) =>
  activityTime(thread.updatedAt ?? thread.createdAt)

/**
 * Picks a project's most recently updated threads for the project card.
 * Sorting happens here (newest first, input order breaks ties) so the
 * section is correct even if the caller's list is stale or unsorted.
 */
export function selectProjectRecentThreads(
  threads: readonly Thread[],
  limit = PROJECT_RECENT_LIMIT,
) {
  const sorted = threads
    .filter((thread) => !thread.parentThreadId && !thread.isIncognito)
    .map((thread, index) => ({ thread, index, time: threadActivity(thread) }))
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .map(({ thread }) => thread)
  return {
    recent: sorted.slice(0, Math.max(0, limit)),
    total: sorted.length,
  }
}
