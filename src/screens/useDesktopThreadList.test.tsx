// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlmaPresenceContext, type AlmaPresence } from '../alma/AlmaPresence'
import { personalThreadKey } from '../alma/personalSetup'
import type { Thread } from '../relay'
import type { PersonalAgentState } from './personalAgent'
import { useDesktopThreadList } from './useDesktopThreadList'

const rows = [
  { id: 'alma', title: 'Alma', updatedAt: '2026-11-05T00:00:00Z' },
  { id: 't1', title: 'Alpha', updatedAt: '2026-11-04T00:00:00Z' },
] as Thread[]
const api = {
  listThreads: vi.fn(async () => rows),
  listWorkspaces: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({})),
}
const stable = vi.hoisted(() => ({
  store: { pairings: [], activeId: 'd1' },
  unread: { seed: () => undefined },
  link: { online: true, epoch: 1 },
}))

vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api, status: 'online', pairing: { id: 'd1' } }),
  useDesktops: () => ({ store: stable.store }),
}))
vi.mock('../desktops/ThreadActivityProvider', () => ({
  useUnreadActivity: () => stable.unread,
  useDesktopThreadEvents: () => undefined,
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

const listWith = (state: PersonalAgentState) => {
  const value = {
    desktopId: 'd1',
    state,
    generating: false,
    face: { mood: 'neutral', activity: 'idle' },
    refresh: async () => undefined,
  } as AlmaPresence
  return renderHook(() => useDesktopThreadList(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AlmaPresenceContext.Provider value={value}>
        {children}
      </AlmaPresenceContext.Provider>
    ),
  })
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
