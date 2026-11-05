import { describe, expect, it } from 'vitest'
import type { Thread, Workspace } from '../relay'
import { gtdSourceThreads, gtdStatusCounts } from '../screens/gtdModel'
import type { PersonalAgentState } from '../screens/personalAgent'
import { selectProjectRecentThreads } from '../screens/projectRecent'
import { filterProjects, filterThreadList } from '../screens/threadListModel'
import type { SearchHit } from '../screens/threadSearch'
import {
  excludePersonalThread,
  personalThreadIds,
  readCachedPersonalThread,
  rememberPersonalThread,
} from './personalThread'
import { personalThreadKey } from './personalSetup'

const workspaces: Workspace[] = [{ id: 'p1', name: 'Proj' }]
const threads = [
  { id: 'alma', title: 'Alma', updatedAt: '2026-11-05T00:00:00Z' },
  { id: 't1', title: 'Alpha', updatedAt: '2026-11-04T00:00:00Z' },
  { id: 't2', title: 'Beta', updatedAt: '2026-11-03T00:00:00Z' },
].map((row) => ({ ...row, workspaceId: 'p1' }) as Thread)
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id)

const ready = (threadId: string | null): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId,
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: 0,
    pendingApprovals: 0,
  },
})

const memoryStorage = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

describe('excludePersonalThread', () => {
  it('drops her thread from the main list and every filter', () => {
    const listed = excludePersonalThread(threads, 'alma')
    expect(ids(filterThreadList(listed, workspaces, '', 'all'))).toEqual([
      't1',
      't2',
    ])
    expect(ids(filterThreadList(listed, workspaces, 'alma', 'all'))).toEqual([])
  })

  it('leaves her out of project groups, their counts and Recent', () => {
    const listed = excludePersonalThread(threads, ['alma'])
    expect(filterProjects(listed, workspaces, '')).toMatchObject([
      { id: 'p1', count: 2 },
    ])
    expect(ids(filterThreadList(listed, workspaces, '', 'p1'))).toEqual([
      't1',
      't2',
    ])
    const { recent, total } = selectProjectRecentThreads(listed)
    expect(ids(recent)).toEqual(['t1', 't2'])
    expect(total).toBe(2)
  })

  it('leaves her out of GTD lists and their counts', () => {
    const source = gtdSourceThreads(excludePersonalThread(threads, 'alma'))
    expect(ids(source)).not.toContain('alma')
    expect(gtdStatusCounts(source).inbox).toBe(2)
  })

  it('drops her thread from desktop search hits', () => {
    const hits: SearchHit[] = [
      { id: 'alma', title: 'Alma', count: 3, snippets: [] },
      { id: 't1', title: 'Alpha', count: 1, snippets: [] },
    ]
    expect(ids(excludePersonalThread(hits, ['alma']))).toEqual(['t1'])
  })

  it('returns the same list when nothing is hidden', () => {
    expect(excludePersonalThread(threads, null)).toBe(threads)
    expect(excludePersonalThread(threads, [])).toBe(threads)
    expect(excludePersonalThread(threads, 'missing')).toBe(threads)
  })
})

describe('personalThreadIds', () => {
  const base = { desktopId: 'd1', presenceDesktopId: 'd1' }

  it('uses the cached id while presence loads or fails', () => {
    for (const status of ['loading', 'error'] as const)
      expect(
        personalThreadIds({ ...base, state: { status }, cached: 'alma' }),
      ).toEqual(['alma'])
    expect(personalThreadIds({ desktopId: 'd1', cached: 'alma' })).toEqual([
      'alma',
    ])
  })

  it("prefers the desktop's thread over a stale cache", () => {
    expect(
      personalThreadIds({ ...base, state: ready('alma'), cached: 'old' }),
    ).toEqual(['alma'])
  })

  it('keeps the cache while a ready desktop is still being set up', () => {
    expect(
      personalThreadIds({ ...base, state: ready(null), cached: 'alma' }),
    ).toEqual(['alma'])
  })

  it('hides nothing on a desktop without a personal agent', () => {
    expect(
      personalThreadIds({
        ...base,
        state: { status: 'unsupported' },
        cached: 'alma',
      }),
    ).toEqual([])
  })

  it('ignores presence for another desktop', () => {
    expect(
      personalThreadIds({
        desktopId: 'd2',
        presenceDesktopId: 'd1',
        state: ready('alma'),
        cached: 'other',
      }),
    ).toEqual(['other'])
  })
})

describe('personal thread cache', () => {
  it('reads and writes personal.thread.<desktopId>', () => {
    const storage = memoryStorage()
    expect(readCachedPersonalThread('d1', storage)).toBeNull()
    rememberPersonalThread('d1', 'alma', storage)
    expect(storage.map.get(personalThreadKey('d1'))).toBe('alma')
    expect(readCachedPersonalThread('d1', storage)).toBe('alma')
  })
})
