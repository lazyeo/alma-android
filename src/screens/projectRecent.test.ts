import { describe, expect, it } from 'vitest'
import type { Thread } from '../relay'
import {
  PROJECT_RECENT_LIMIT,
  selectProjectRecentThreads,
} from './projectRecent'

const thread = (id: string, updatedAt?: string, extra: Partial<Thread> = {}) =>
  ({ id, title: id, workspaceId: 'p1', updatedAt, ...extra }) as Thread

describe('selectProjectRecentThreads', () => {
  it('returns the five most recently updated threads, newest first', () => {
    const threads = [
      thread('a', '2026-11-01T00:00:00Z'),
      thread('b', '2026-11-04T00:00:00Z'),
      thread('c', '2026-10-30T00:00:00Z'),
      thread('d', '2026-11-03T00:00:00Z'),
      thread('e', '2026-11-02T00:00:00Z'),
      thread('f', '2026-10-01T00:00:00Z'),
      thread('g', '2026-11-05T00:00:00Z'),
    ]
    const { recent, total } = selectProjectRecentThreads(threads)
    expect(PROJECT_RECENT_LIMIT).toBe(5)
    expect(recent.map((row) => row.id)).toEqual(['g', 'b', 'd', 'e', 'a'])
    expect(total).toBe(7)
  })

  it('falls back to createdAt and keeps input order for ties', () => {
    const threads = [
      thread('x', undefined, { createdAt: '2026-11-02T00:00:00Z' }),
      thread('y', '2026-11-02T00:00:00Z'),
      thread('z', '2026-11-03T00:00:00Z'),
    ]
    expect(
      selectProjectRecentThreads(threads).recent.map((row) => row.id),
    ).toEqual(['z', 'x', 'y'])
  })

  it('skips child and incognito threads in both the rows and the total', () => {
    const threads = [
      thread('main', '2026-11-01T00:00:00Z'),
      thread('child', '2026-11-04T00:00:00Z', { parentThreadId: 'main' }),
      thread('secret', '2026-11-04T00:00:00Z', { isIncognito: true }),
    ]
    expect(selectProjectRecentThreads(threads)).toEqual({
      recent: [threads[0]],
      total: 1,
    })
  })

  it('is empty for a project without threads', () => {
    expect(selectProjectRecentThreads([])).toEqual({ recent: [], total: 0 })
  })
})
