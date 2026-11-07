// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlmaPresenceContext, type AlmaPresence } from '../alma/AlmaPresence'
import { personalThreadKey } from '../alma/personalSetup'
import { threadCache, type AlmaSettings, type Thread } from '../relay'
import type { PersonalAgentState } from './personalAgent'
import { useDesktopThreadList } from './useDesktopThreadList'

const rows = [
  { id: 'alma', title: 'Alma', updatedAt: '2026-11-05T00:00:00Z' },
  { id: 't1', title: 'Alpha', updatedAt: '2026-11-04T00:00:00Z' },
] as Thread[]
const runThread = (id: string) =>
  ({
    id,
    title: 'herdr · cairn',
    updatedAt: '2026-11-06T00:00:00Z',
    metadata: {
      personalRun: { runId: `r-${id}`, kind: 'dispatch', parentThreadId: 'a' },
    },
  }) as Thread
const api = {
  listThreads: vi.fn(async (): Promise<Thread[]> => rows),
  listWorkspaces: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({})),
}
const stable = vi.hoisted(() => ({
  store: { pairings: [], activeId: 'd1' },
  unread: { seed: () => undefined },
  link: { online: true, epoch: 1 },
  onEvent: undefined as undefined | ((event: { type: string }) => void),
}))

vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api, status: 'online', pairing: { id: 'd1' } }),
  useDesktops: () => ({ store: stable.store }),
}))
vi.mock('../desktops/ThreadActivityProvider', () => ({
  useUnreadActivity: () => stable.unread,
  useDesktopThreadEvents: (_: string, handler: (e: { type: string }) => void) =>
    void (stable.onEvent = handler),
}))
vi.mock('../desktops/useRealtimeLink', () => ({
  useRealtimeLink: () => stable.link,
}))
vi.mock('../share/shareShortcuts', () => ({
  desktopShareShortcuts: () => [],
  publishShareShortcuts: () => undefined,
}))

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
})
afterEach(() => {
  cleanup()
  api.listThreads.mockImplementation(async () => rows)
})

const ready = (threadId: string): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId,
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: 0,
    pendingApprovals: 0,
  },
})

const listWith = (state: PersonalAgentState, renders: string[][] = []) => {
  const value = {
    desktopId: 'd1',
    state,
    generating: false,
    face: { mood: 'neutral', activity: 'idle' },
    refresh: async () => undefined,
  } as AlmaPresence
  return renderHook(
    () => {
      const list = useDesktopThreadList()
      renders.push(list.threads.map((row) => row.id))
      return list
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AlmaPresenceContext.Provider value={value}>
          {children}
        </AlmaPresenceContext.Provider>
      ),
    },
  )
}
const listedIds = (threads: Thread[]) => threads.map((row) => row.id)

describe('useDesktopThreadList and her main conversation', () => {
  it('hides her thread from the cached id while presence loads', async () => {
    localStorage.setItem(personalThreadKey('d1'), 'alma')
    const { result } = listWith({ status: 'loading' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(listedIds(result.current.threads)).toEqual(['t1'])
  })

  it("hides the desktop's main thread once presence is ready", async () => {
    const { result } = listWith(ready('alma'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(listedIds(result.current.threads)).toEqual(['t1'])
  })

  it('lists every thread on a desktop without a personal agent', async () => {
    localStorage.setItem(personalThreadKey('d1'), 'alma')
    const { result } = listWith({ status: 'unsupported' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(listedIds(result.current.threads)).toEqual(['alma', 't1'])
  })
})

describe('useDesktopThreadList and her background run threads', () => {
  it('lists none of them but keeps them searchable', async () => {
    api.listThreads.mockImplementation(async () => [runThread('run1'), ...rows])
    const { result } = listWith(ready('alma'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(listedIds(result.current.threads)).toEqual(['t1'])
    expect(listedIds(result.current.searchableThreads)).toEqual(['run1', 't1'])
  })

  it('never paints one that arrives by thread_created', async () => {
    const renders: string[][] = []
    const { result } = listWith(ready('alma'), renders)
    await waitFor(() => expect(result.current.loading).toBe(false))
    api.listThreads.mockImplementation(async () => [
      runThread('run1'),
      { id: 't2', title: 'Beta' } as Thread,
      ...rows,
    ])
    act(() => stable.onEvent?.({ type: 'thread_created' }))
    await waitFor(() =>
      expect(listedIds(result.current.threads)).toEqual(['t2', 't1']),
    )
    expect(listedIds(result.current.searchableThreads)).toContain('run1')
    expect(renders.flat()).not.toContain('run1')
  })

  it('never paints a cron run that arrives by thread_updated', async () => {
    const renders: string[][] = []
    const { result } = listWith(ready('alma'), renders)
    await waitFor(() => expect(result.current.loading).toBe(false))
    api.listThreads.mockImplementation(async () => [
      { id: 'cron1', title: 'Digest', metadata: { isCron: true } } as Thread,
      ...rows,
    ])
    act(() => stable.onEvent?.({ type: 'thread_updated' }))
    await waitFor(() =>
      expect(listedIds(result.current.searchableThreads)).toContain('cron1'),
    )
    expect(renders.flat()).not.toContain('cron1')
  })

  it('keeps one cached from an earlier session out of the first paint', async () => {
    threadCache.setThreadList('d1', {
      threads: [runThread('run1'), ...rows],
      workspaces: [],
      settings: {} as AlmaSettings,
    })
    const renders: string[][] = []
    const { result } = listWith(ready('alma'), renders)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(renders.flat()).not.toContain('run1')
  })
})

describe('useDesktopThreadList and slow list fetches', () => {
  const deferred = () => {
    let resolve!: (rows: Thread[]) => void
    const promise = new Promise<Thread[]>((done) => (resolve = done))
    return { promise, resolve }
  }

  it('ignores an answer that comes back after a newer one', async () => {
    const { result } = listWith({ status: 'unsupported' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const slow = deferred(),
      fast = deferred()
    api.listThreads
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise)
    act(() => stable.onEvent?.({ type: 'thread_updated' }))
    act(() => stable.onEvent?.({ type: 'thread_created' }))
    await act(async () => fast.resolve([{ id: 't2' } as Thread, ...rows]))
    await act(async () => slow.resolve(rows))
    expect(listedIds(result.current.threads)).toEqual(['t2', 'alma', 't1'])
  })

  it('keeps a generating flag that arrived while the fetch was out', async () => {
    const { result } = listWith({ status: 'unsupported' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const slow = deferred()
    api.listThreads.mockImplementationOnce(() => slow.promise)
    act(() => stable.onEvent?.({ type: 'thread_updated' }))
    act(() =>
      stable.onEvent?.({
        type: 'thread_generating',
        data: { id: 't1', isGenerating: true },
      } as { type: string }),
    )
    await act(async () => slow.resolve(rows))
    expect(
      result.current.threads.find((row) => row.id === 't1')?.isGenerating,
    ).toBe(true)
  })

  it('does not bring back a thread deleted while the fetch was out', async () => {
    const { result } = listWith({ status: 'unsupported' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const slow = deferred()
    api.listThreads.mockImplementationOnce(() => slow.promise)
    act(() => void result.current.reload())
    act(() =>
      result.current.setThreads((list) =>
        list.filter((row) => row.id !== 't1'),
      ),
    )
    await act(async () => slow.resolve(rows))
    expect(listedIds(result.current.threads)).toEqual(['alma'])
  })
})
