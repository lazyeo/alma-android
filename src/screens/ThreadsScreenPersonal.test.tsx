// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState, type ReactNode } from 'react'
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
  getWorkspaceFavicon: vi.fn(async () => null),
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
    { id: 'tg1', title: 'Telegram · Sam', updatedAt: '2026-11-01T00:00:00Z' },
    {
      id: 'run1',
      title: 'herdr · cairn',
      updatedAt: '2026-11-05T00:00:00Z',
      metadata: {
        personalRun: { runId: 'r1', kind: 'dispatch', parentThreadId: 'alma' },
      },
    },
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
// The hook's own filtering is covered in useDesktopThreadList.test.tsx; this
// mirrors its split so the screen renders the same lists it would get.
vi.mock('./useDesktopThreadList', async () => {
  const {
    backgroundThreadKind,
    excludePersonalRunThreads,
    excludePersonalThread,
  } = await vi.importActual<typeof import('../alma/personalThread')>(
    '../alma/personalThread',
  )
  const { useShowHiddenThreads } = await vi.importActual<
    typeof import('./showHiddenThreads')
  >('./showHiddenThreads')
  return {
    useDesktopThreadList: () => {
      const [rows, setThreads] = useState(initialThreads)
      const searchableThreads = excludePersonalThread(rows, 'alma')
      const [error, setError] = useState<string>()
      const [showHidden, setShowHidden] = useShowHiddenThreads()
      const withExternal = showHidden
        ? searchableThreads
        : searchableThreads.filter((thread) => thread.id !== 'tg1')
      return {
        threads: showHidden
          ? withExternal
          : excludePersonalRunThreads(withExternal),
        searchableThreads,
        showHidden,
        setShowHidden,
        // tg1 stands in for a desktop channel chat (see the hook tests).
        hiddenKindOf: (thread: Thread) =>
          thread.id === 'tg1' ? 'external' : backgroundThreadKind(thread),
        setThreads,
        workspaces,
        settings: {},
        loading: false,
        error,
        setError,
        reload: async () => undefined,
      }
    },
  }
})
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
    trailing,
  }: {
    items: { value: string; label: string }[]
    onSelect(value: string): void
    trailing?: ReactNode
  }) => (
    <>
      {items.map((item) => (
        <button
          role="tab"
          key={item.value}
          onClick={() => onSelect(item.value)}
        >
          {item.label}
        </button>
      ))}
      {trailing}
    </>
  ),
}))
vi.mock('../haptics', () => ({ haptic: () => Promise.resolve() }))

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

describe('ThreadsScreen and her background run threads', () => {
  const renderThreads = () =>
    render(
      <MemoryRouter initialEntries={['/d/d1/threads']}>
        <ThreadsScreen />
      </MemoryRouter>,
    )
  const rowTitles = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
      (row) => row.firstElementChild?.textContent,
    )

  it('leaves them out of the thread list', () => {
    renderThreads()
    const rows = rowTitles('.thread-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatch(/^Alpha/)
    expect(rows[1]).toMatch(/^Beta/)
    expect(document.body.textContent).not.toContain('herdr · cairn')
  })

  it('leaves them out of project groups and their counts', () => {
    renderThreads()
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(screen.getByText('2 threads')).toBeTruthy()
    expect(rowTitles('.project-threads-inner > .project-thread-row')).toEqual([
      'Alpha',
      'Beta',
    ])
    expect(document.body.textContent).not.toContain('herdr · cairn')
  })

  it('still finds them in search and opens them from a result', async () => {
    navigate.mockClear()
    renderThreads()
    fireEvent.change(screen.getByLabelText('Search threads and projects'), {
      target: { value: 'herdr' },
    })
    const title = await waitFor(() => {
      const match = Array.from(
        document.querySelectorAll<HTMLElement>('.search-result-title'),
      ).find((node) => node.textContent?.startsWith('herdr · cairn'))
      expect(match).toBeTruthy()
      return match!
    })
    fireEvent.click(title)
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining('/threads/run1'),
      expect.anything(),
    )
  })
})

describe('ThreadsScreen with "Show hidden threads"', () => {
  const renderThreads = () =>
    render(
      <MemoryRouter initialEntries={['/d/d1/threads']}>
        <ThreadsScreen />
      </MemoryRouter>,
    )
  const showHidden = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Thread filters/ }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Show hidden threads' }),
    )
  }

  it('is off by default and offers the switch unchecked', async () => {
    renderThreads()
    expect(document.body.textContent).not.toContain('herdr · cairn')
    fireEvent.click(screen.getByRole('button', { name: 'Thread filters' }))
    const item = await screen.findByRole('menuitem', {
      name: 'Show hidden threads',
    })
    expect(item.querySelector('.anchored-menu-check')).toBeNull()
  })

  it('brings her run thread back into the list with a work thread tag', async () => {
    renderThreads()
    await showHidden()
    const run = Array.from(
      document.querySelectorAll<HTMLElement>('.thread-row'),
    ).find((row) => row.textContent?.includes('herdr · cairn'))
    expect(run?.querySelector('.thread-hidden-tag')?.textContent).toBe(
      'Work thread',
    )
    // Her main conversation stays behind the Alma tab either way.
    expect(document.querySelectorAll('.thread-row')).toHaveLength(4)
    expect(document.querySelectorAll('.thread-hidden-tag')).toHaveLength(2)
  })

  it('brings external chats back tagged, and says the filter is on', async () => {
    renderThreads()
    expect(document.body.textContent).not.toContain('Telegram · Sam')
    await showHidden()
    const chat = Array.from(
      document.querySelectorAll<HTMLElement>('.thread-row'),
    ).find((row) => row.textContent?.includes('Telegram · Sam'))
    expect(chat?.querySelector('.thread-hidden-tag')?.textContent).toBe(
      'External chat',
    )
    expect(
      screen.getByRole('button', {
        name: 'Thread filters, hidden threads shown',
      }),
    ).toBeTruthy()
  })

  it('tags it in the project card Recent list', async () => {
    renderThreads()
    await showHidden()
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    await waitFor(() => expect(api.getProjectCard).toHaveBeenCalled())
    fireEvent.click(
      document.querySelector<HTMLElement>('.project-card-summary-row')!,
    )
    const recent = await waitFor(() => {
      const row = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.project-card-recent .project-thread-row',
        ),
      ).find((node) => node.textContent?.includes('herdr · cairn'))
      expect(row).toBeTruthy()
      return row!
    })
    expect(recent.querySelector('.thread-hidden-tag')?.textContent).toBe(
      'Work thread',
    )
  })

  it('counts and tags it in its project group too', async () => {
    renderThreads()
    await showHidden()
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(screen.getByText('4 threads')).toBeTruthy()
    const run = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.project-threads-inner > .project-thread-row',
      ),
    ).find((row) => row.textContent?.includes('herdr · cairn'))
    expect(run?.querySelector('.thread-hidden-tag')?.textContent).toBe(
      'Work thread',
    )
  })

  it('remembers the choice for the next visit, and turns back off', async () => {
    const first = renderThreads()
    await showHidden()
    first.unmount()
    renderThreads()
    expect(document.body.textContent).toContain('herdr · cairn')
    await showHidden()
    expect(document.body.textContent).not.toContain('herdr · cairn')
  })
})
