import { describe, expect, it } from 'vitest'
import type { Thread } from '../relay'
import {
  GTD_ALL_STATUSES,
  GTD_SEGMENT_STORAGE_KEY,
  GTD_STATUS_ICON,
  GTD_STATUS_ORDER,
  INBOX_RECENT_MS,
  favoriteGroups,
  gtdSourceThreads,
  gtdStatusCounts,
  gtdStatusOf,
  loadGtdSegment,
  saveGtdSegment,
  splitInbox,
  threadsInStatus,
} from './gtdModel'
import { filterThreadList } from './threadListModel'

const NOW = Date.parse('2026-10-26T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

describe('GTD status segments', () => {
  it('orders visible segments with the swipe pipeline and keeps archive separate', () => {
    expect(GTD_STATUS_ORDER).toEqual(['inbox', 'todo', 'in_progress', 'done'])
    expect(GTD_ALL_STATUSES).toEqual([
      'inbox',
      'todo',
      'in_progress',
      'done',
      'archived',
    ])
  })

  it('maps visible statuses to the agreed Lucide icons', () => {
    expect(
      GTD_STATUS_ORDER.map((status) => GTD_STATUS_ICON[status].displayName),
    ).toEqual(['Inbox', 'ListTodo', 'Clock', 'CircleCheck'])
  })

  it('treats a missing or unknown status as inbox, like Desktop', () => {
    expect(gtdStatusOf({ id: 'a' })).toBe('inbox')
    expect(gtdStatusOf({ id: 'b', metadata: { gtdStatus: 'later' } })).toBe(
      'inbox',
    )
    expect(gtdStatusOf({ id: 'c', metadata: { gtdStatus: 'done' } })).toBe(
      'done',
    )
  })

  it('counts every segment, including empty ones', () => {
    expect(
      gtdStatusCounts([
        { id: 'a', metadata: { gtdStatus: 'todo' } },
        { id: 'b', metadata: { gtdStatus: 'todo' } },
        { id: 'c', metadata: { gtdStatus: 'in_progress' } },
        { id: 'd' },
      ]),
    ).toEqual({ todo: 2, in_progress: 1, inbox: 1, done: 0, archived: 0 })
  })

  it('uses the same top-level non-incognito source as the Threads list', () => {
    const threads: Thread[] = [
      { id: 'top', updatedAt: 3 },
      { id: 'child', parentThreadId: 'top', updatedAt: 2 },
      { id: 'secret', isIncognito: true, updatedAt: 1 },
      { id: 'nullParent', parentThreadId: null, updatedAt: 0 },
    ]
    expect(gtdSourceThreads(threads).map((t) => t.id)).toEqual(
      filterThreadList(threads, [], '').map((t) => t.id),
    )
    expect(gtdSourceThreads(threads).map((t) => t.id)).toEqual([
      'top',
      'nullParent',
    ])
  })

  it('lists one status by updatedAt descending, then id', () => {
    const threads: Thread[] = [
      { id: 'b', metadata: { gtdStatus: 'todo' }, updatedAt: iso(NOW - 10) },
      { id: 'a', metadata: { gtdStatus: 'todo' }, updatedAt: iso(NOW - 10) },
      { id: 'n', metadata: { gtdStatus: 'todo' }, updatedAt: iso(NOW) },
      { id: 'x', metadata: { gtdStatus: 'done' }, updatedAt: iso(NOW) },
    ]
    expect(threadsInStatus(threads, 'todo').map((t) => t.id)).toEqual([
      'n',
      'a',
      'b',
    ])
  })
})

describe('GTD favorites', () => {
  it('sorts pinned favorites by order desc, updatedAt desc, then id', () => {
    const threads: Thread[] = [
      {
        id: 'low',
        isFavorited: true,
        isFavoritePinned: true,
        favoritePinnedOrder: 1,
        updatedAt: iso(NOW),
      },
      {
        id: 'high-old',
        isFavorited: true,
        isFavoritePinned: true,
        favoritePinnedOrder: 3,
        updatedAt: iso(NOW - 5_000),
      },
      {
        id: 'high-new',
        isFavorited: true,
        isFavoritePinned: true,
        favoritePinnedOrder: 3,
        updatedAt: iso(NOW),
      },
      {
        id: 'tie-b',
        isFavorited: true,
        isFavoritePinned: true,
        favoritePinnedOrder: 3,
        updatedAt: iso(NOW - 5_000),
      },
      // Missing order counts as 0, matching Desktop.
      {
        id: 'unordered',
        isFavorited: true,
        isFavoritePinned: true,
        updatedAt: iso(NOW + 1),
      },
    ]
    expect(favoriteGroups(threads).pinned.map((t) => t.id)).toEqual([
      'high-new',
      'high-old',
      'tie-b',
      'low',
      'unordered',
    ])
  })

  it('sorts normal favorites by updatedAt desc and excludes non-favorites', () => {
    const threads: Thread[] = [
      { id: 'old', isFavorited: true, updatedAt: iso(NOW - 2_000) },
      { id: 'new', isFavorited: true, updatedAt: iso(NOW) },
      { id: 'b', isFavorited: true, updatedAt: iso(NOW - 1_000) },
      { id: 'a', isFavorited: true, updatedAt: iso(NOW - 1_000) },
      { id: 'plain', updatedAt: iso(NOW + 5) },
      // A stale pin flag without isFavorited is not a favorite.
      { id: 'stale', isFavoritePinned: true, favoritePinnedOrder: 9 },
    ]
    const groups = favoriteGroups(threads)
    expect(groups.pinned).toEqual([])
    expect(groups.favorites.map((t) => t.id)).toEqual(['new', 'a', 'b', 'old'])
  })
})

describe('GTD inbox recency', () => {
  it('keeps exactly 7×24h old threads recent and folds anything older', () => {
    expect(INBOX_RECENT_MS).toBe(7 * 24 * 60 * 60 * 1000)
    const edge = NOW - INBOX_RECENT_MS
    const { recent, older } = splitInbox(
      [
        { id: 'edge', updatedAt: iso(edge) },
        { id: 'just-older', updatedAt: iso(edge - 1) },
        { id: 'fresh', updatedAt: iso(NOW - 1) },
      ],
      NOW,
    )
    expect(recent.map((t) => t.id)).toEqual(['fresh', 'edge'])
    expect(older.map((t) => t.id)).toEqual(['just-older'])
  })

  it('falls back to createdAt and folds threads without a usable time', () => {
    const { recent, older } = splitInbox(
      [
        { id: 'created', createdAt: NOW - 1_000 },
        { id: 'unknown' },
        { id: 'garbage', updatedAt: 'not a date' },
      ],
      NOW,
    )
    expect(recent.map((t) => t.id)).toEqual(['created'])
    expect(older.map((t) => t.id)).toEqual(['garbage', 'unknown'])
  })
})

describe('GTD segment persistence', () => {
  it('defaults to todo, restores a visible segment, and opens a persisted archive view', () => {
    const storage = memoryStorage()
    expect(loadGtdSegment(storage)).toBe('todo')
    saveGtdSegment(storage, 'done')
    expect(storage.values.get(GTD_SEGMENT_STORAGE_KEY)).toBe('done')
    expect(loadGtdSegment(storage)).toBe('done')
    saveGtdSegment(storage, 'archived')
    expect(loadGtdSegment(storage)).toBe('archived')
  })

  it('ignores invalid values and unavailable storage', () => {
    const storage = memoryStorage()
    storage.setItem(GTD_SEGMENT_STORAGE_KEY, 'later')
    expect(loadGtdSegment(storage)).toBe('todo')
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadGtdSegment(broken)).toBe('todo')
    expect(() => saveGtdSegment(broken, 'inbox')).not.toThrow()
  })
})
