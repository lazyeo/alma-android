import type { Thread } from '../relay'
import { activityTime } from './projectGroups'
export type UnreadState = Record<
  string,
  {
    lastSeenAt: number
    updated: number
    assistant: boolean
    unread: boolean
  }
>
export function reconcileUnread(
  state: UnreadState,
  threads: Thread[],
): UnreadState {
  return Object.fromEntries(
    threads.map((thread) => {
      const updated = activityTime(thread.updatedAt ?? thread.createdAt)
      const before = state[thread.id]
      return [
        thread.id,
        before
          ? {
              ...before,
              updated: Math.max(updated, before.updated),
              unread:
                before.unread ||
                (before.assistant && updated > before.lastSeenAt),
            }
          : { lastSeenAt: updated, updated, assistant: false, unread: false },
      ]
    }),
  )
}
export function completeUnread(
  state: UnreadState,
  id: string,
  updated: number,
  openAndVisible = false,
): UnreadState {
  const before = state[id]
  const latest = Math.max(updated, before?.updated ?? 0)
  const lastSeenAt = openAndVisible
    ? Math.max(latest, before?.lastSeenAt ?? 0)
    : (before?.lastSeenAt ?? 0)
  return {
    ...state,
    [id]: {
      updated: latest,
      lastSeenAt,
      assistant: true,
      unread: latest > lastSeenAt,
    },
  }
}
export function readUnread(
  state: UnreadState,
  id: string,
  seenAt = state[id]?.updated ?? 0,
): UnreadState {
  const before = state[id] ?? {
    updated: 0,
    lastSeenAt: 0,
    assistant: false,
    unread: false,
  }
  return {
    ...state,
    [id]: {
      ...before,
      lastSeenAt: Math.max(before.lastSeenAt, before.updated, seenAt),
      unread: false,
    },
  }
}
export function parseUnreadStore(raw: string): Record<string, UnreadState> {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([, rows]) =>
            rows && typeof rows === 'object' && !Array.isArray(rows),
        )
        .map(([desktop, rows]) => [
          desktop,
          Object.fromEntries(
            Object.entries(rows).flatMap(([id, entry]) => {
              if (!entry || typeof entry !== 'object') return []
              const row = entry as Record<string, unknown>
              if (
                typeof row.updated !== 'number' ||
                !Number.isFinite(row.updated) ||
                typeof row.assistant !== 'boolean' ||
                typeof row.unread !== 'boolean'
              )
                return []
              // Migrate v1 entries without inventing a read receipt for unread replies.
              const lastSeenAt =
                row.lastSeenAt === undefined
                  ? row.unread
                    ? 0
                    : row.updated
                  : row.lastSeenAt
              if (
                typeof lastSeenAt !== 'number' ||
                !Number.isFinite(lastSeenAt)
              )
                return []
              return [
                [
                  id,
                  {
                    updated: row.updated,
                    assistant: row.assistant,
                    unread: row.unread,
                    lastSeenAt,
                  },
                ],
              ]
            }),
          ),
        ]),
    )
  } catch {
    return {}
  }
}
