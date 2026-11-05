// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  organize: {
    menuItems: () => [],
    overlays: null,
    pendingDoneIds: new Set<string>(),
    setStatus: () => undefined,
  },
}))
const navigate = vi.fn()
const api = {
  deleteThread: vi.fn(async () => undefined),
  getProjectCard: vi.fn(async () => ({
    card: { brief: 'Brief', focus: 'Focus', resume: [] },
  })),
  searchThreads: vi.fn(async () => []),
}

const workspaces: Workspace[] = [{ id: 'p1', name: 'Proj' }]
const initialThreads = (): Thread[] =>
  [
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
    const [threads, setThreads] = useState(initialThreads)
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
vi.mock('../alma/AlmaPresence', () => ({ useAlmaPresence: () => undefined }))
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

const renderProjects = () => {
  render(
    <MemoryRouter initialEntries={['/d/d1/threads']}>
      <ThreadsScreen />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
}

const groupRow = (title: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '.project-threads-inner > .project-thread-row',
    ),
  ).find((row) => row.firstElementChild?.textContent === title)!

const actionMenu = () => screen.getByRole('menu')

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
  navigate.mockClear()
  api.deleteThread.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ThreadsScreen project thread actions', () => {
  it('opens row actions on long press without opening the thread', () => {
    vi.useFakeTimers()
    renderProjects()
    const row = groupRow('Alpha')
    fireEvent.pointerDown(row, { button: 0, clientX: 40, clientY: 50 })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.pointerUp(row)
    fireEvent.click(row)
    expect(actionMenu()).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens row actions on contextmenu and from the keyboard', () => {
    renderProjects()
    fireEvent.contextMenu(groupRow('Alpha'), { clientX: 40, clientY: 50 })
    expect(within(actionMenu()).getByText('Delete')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    cleanup()
    renderProjects()
    fireEvent.keyDown(groupRow('Beta'), { key: 'F10', shiftKey: true })
    expect(within(actionMenu()).getByText('Delete')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('deletes a thread from a project group and drops its row', async () => {
    renderProjects()
    fireEvent.contextMenu(groupRow('Alpha'), { clientX: 40, clientY: 50 })
    fireEvent.click(within(actionMenu()).getByText('Delete'))
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Delete thread' }),
    )
    await waitFor(() => expect(api.deleteThread).toHaveBeenCalledWith('t1'))
    await waitFor(() => expect(groupRow('Alpha')).toBeUndefined())
    expect(groupRow('Beta')).toBeTruthy()
  })

  it('opens the same actions from the project card Recent list', async () => {
    renderProjects()
    await waitFor(() => expect(api.getProjectCard).toHaveBeenCalled())
    fireEvent.click(
      document.querySelector<HTMLElement>('.project-card-summary-row')!,
    )
    const card = await waitFor(() =>
      expect(document.querySelector('.project-card-recent')).toBeTruthy(),
    ).then(() => document.querySelector<HTMLElement>('.project-card-recent')!)
    const recent = Array.from(
      card.querySelectorAll<HTMLElement>(
        '.project-card-recent .project-thread-row',
      ),
    ).find((row) => row.firstElementChild?.textContent === 'Beta')!
    fireEvent.contextMenu(recent, { clientX: 40, clientY: 50 })
    fireEvent.click(within(actionMenu()).getByText('Delete'))
    fireEvent.click(await screen.findByText('Delete thread'))
    await waitFor(() => expect(api.deleteThread).toHaveBeenCalledWith('t2'))
    await waitFor(() => expect(groupRow('Beta')).toBeUndefined())
    expect(navigate).not.toHaveBeenCalled()
  })
})
