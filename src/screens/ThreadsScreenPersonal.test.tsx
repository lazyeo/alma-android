// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Thread, Workspace } from '../relay'
import { ThreadsScreen } from './ThreadsScreen'

const stable = vi.hoisted(() => ({
  unread: { unread: {}, markRead: () => undefined },
  generating: new Set<string>(),
  handoff: { approvals: [], questions: [] },
  timeClues: { supported: false, unread: false },
  accessory: () => undefined,
  presence: {
    desktopId: 'd1',
    state: {
      status: 'ready',
      personal: {
        threadId: 'alma',
        today: { spentUsd: 0, budgetUsd: null, over: false },
        running: 0,
        pendingApprovals: 0,
      },
    },
  },
  organize: {
    menuItems: () => [],
    overlays: null,
    pendingDoneIds: new Set<string>(),
    setStatus: () => undefined,
  },
}))
const navigate = vi.fn()
const api = {
  getProjectCard: vi.fn(async () => ({
    card: { brief: 'Brief', focus: 'Focus', resume: [] },
  })),
  searchThreads: vi.fn(async () => [
    {
      id: 'alma',
      title: 'Alma notes',
      matches: [{ id: 'm1', content: 'notes for today' }],
    },
    {
      id: 't1',
      title: 'Alpha',
      matches: [{ id: 'm2', content: 'notes on alpha' }],
    },
  ]),
}

const workspaces: Workspace[] = [{ id: 'p1', name: 'Proj' }]
const initialThreads = (): Thread[] =>
  [
    { id: 'alma', title: 'Alma notes', updatedAt: '2026-11-04T00:00:00Z' },
    { id: 't1', title: 'Alpha', updatedAt: '2026-11-03T00:00:00Z' },
    { id: 't2', title: 'Beta', updatedAt: '2026-11-02T00:00:00Z' },
  ].map((row) => ({ ...row, workspaceId: 'p1' }) as Thread)

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('../desktops/DesktopTitleSwitcher', () => ({
  DesktopTitleSwitcher: ({ fallback }: { fallback: string }) => (
    <span className="desktop-title-stub">{fallback}</span>
  ),
}))
vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api, pairing: { id: 'd1' } }),
}))
vi.mock('./useDesktopThreadList', () => ({
  useDesktopThreadList: () => {
    const [threads, setThreads] = useState(() =>
      initialThreads().filter((row) => row.id !== 'alma'),
    )
    const [error, setError] = useState<string>()
    return {
      threads,
      setThreads,
      workspaces,
      settings: {},
      loading: false,
      error,
      setError,
      reload: async () => undefined,
    }
  },
}))
vi.mock('../desktops/ThreadActivityProvider', () => ({
  useUnreadActivity: () => stable.unread,
  useGeneratingIds: () => stable.generating,
  useDesktopThreadEvents: () => undefined,
}))
vi.mock('../handoff/HandoffProvider', () => ({
  useHandoff: () => stable.handoff,
}))
vi.mock('../extensions', () => ({
  useThreadListAccessory: () => stable.accessory,
}))
vi.mock('./useTimeCluesStatus', () => ({
  useTimeCluesStatus: () => stable.timeClues,
}))
vi.mock('../alma/AlmaPresence', () => ({
  useAlmaPresence: () => stable.presence,
}))
vi.mock('./ThreadOrganize', () => ({
  useThreadOrganize: () => stable.organize,
}))
vi.mock('../components/TabBar', () => ({
  TabBar: ({
    items,
    onSelect,
  }: {
    items: { value: string; label: string }[]
    onSelect(value: string): void
  }) =>
    items.map((item) => (
      <button role="tab" key={item.value} onClick={() => onSelect(item.value)}>
        {item.label}
      </button>
    )),
}))
vi.mock('../haptics', () => ({ haptic: () => Promise.resolve() }))

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ThreadsScreen search and her main conversation', () => {
  it('leaves her thread out of title and content matches', async () => {
    render(
      <MemoryRouter initialEntries={['/d/d1/threads']}>
        <ThreadsScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Search threads and projects'), {
      target: { value: 'notes' },
    })
    await waitFor(() => expect(api.searchThreads).toHaveBeenCalled())
    const results = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('.search-results')
      expect(node?.textContent).toContain('Alpha')
      return node!
    })
    expect(results.textContent).not.toContain('Alma notes')
    expect(results.querySelectorAll('.search-result-title').length).toBe(1)
  })
})
