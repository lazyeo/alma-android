// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AgentsNavLink, AppShell } from './AppShell'

const mocks = vi.hoisted(() => ({
  mode: 'split' as 'split' | 'single',
  personal: { status: 'unsupported' } as PersonalAgentState,
}))

vi.mock('../desktops/ThreadActivityProvider', () => ({
  useGeneratingIds: () => new Set<string>(),
}))

vi.mock('../screens/usePersonalAgent', () => ({
  usePersonalAgent: () => ({
    state: mocks.personal,
    refresh: vi.fn(),
  }),
}))

vi.mock('../desktops/DesktopContext', () => ({
  ConnectionContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
  useDesktops: () => ({
    store: {
      activeId: 'desktop',
      pairings: [{ id: 'desktop', name: 'Desktop' }],
    },
    desktops: [],
  }),
}))

vi.mock('./useLayoutMode', () => ({
  useLayoutMode: () => mocks.mode,
  useSidebarCollapsed: () => [false, vi.fn(), vi.fn()],
}))

vi.mock('./useSidebarSwipe', () => ({
  useSidebarSwipe: () => ({}),
}))

vi.mock('../herdr/HerdrProvider', () => ({
  useHerdr: () => ({ agents: () => [] }),
}))

vi.mock('../herdr/AgentsSidebar', () => ({
  AgentsSidebar: () => <div />,
}))

vi.mock('../updates/UpdateProvider', () => ({
  useUpdates: () => ({ badge: false }),
}))

vi.mock('../screens/useTimeCluesStatus', () => ({
  useTimeCluesStatus: () => ({ supported: true, unread: false }),
}))

describe('split rail navigation', () => {
  it.each([
    ['threads root', '/d/desktop/threads'],
    ['thread', '/d/desktop/threads/thread-1'],
    ['GTD', '/d/desktop/gtd'],
    ['GTD detail', '/d/desktop/gtd/thread-1'],
    ['crystals', '/d/desktop/crystals'],
    ['time clues', '/d/desktop/time-clues'],
    ['references', '/d/desktop/references'],
    ['Herdr', '/d/desktop/agents'],
    ['settings', '/settings'],
    ['Alma', '/d/desktop/alma'],
  ])('marks exactly one item active on %s', (_label, route) => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<div />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    )

    expect(
      container.querySelectorAll('.split-rail [aria-current="page"]'),
    ).toHaveLength(1)
    cleanup()
  })
})

const readyPersonal: PersonalAgentState = {
  status: 'ready',
  personal: {
    threadId: 'main',
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: 0,
    pendingApprovals: 0,
  },
}

function renderShell(route: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<div />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('Alma in the navigation', () => {
  it('leaves the phone tab bar unchanged when the desktop has no personal agent', () => {
    mocks.mode = 'single'
    mocks.personal = { status: 'unsupported' }
    const { container } = renderShell('/d/desktop/threads')
    const bar = container.querySelector('.tab-bar')!
    expect(bar.classList.contains('with-alma')).toBe(false)
    expect(bar.querySelector('.alma-nav')).toBeNull()
    expect(bar.querySelector('.tab-bar-half')).toBeNull()
    // Threads, Herdr, GTD, Settings, evenly
    expect(
      [...bar.querySelectorAll(':scope > a')].map((a) => a.textContent),
    ).toEqual(['Threads', 'Herdr', 'GTD', 'Settings'])
    cleanup()
  })

  it('puts the avatar between two halves of the phone tabs', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const bar = container.querySelector('.tab-bar.with-alma')!
    const children = [...bar.children]
    expect(children.map((child) => child.className)).toEqual([
      'tab-bar-half',
      'alma-nav alma-nav-tab',
      'tab-bar-half',
    ])
    // Threads, Herdr | Alma | GTD, Settings: two each side.
    expect(
      children.map((child) =>
        [...child.querySelectorAll('a')].map((a) => a.textContent),
      ),
    ).toEqual([['Threads', 'Herdr'], [], ['GTD', 'Settings']])
    expect(bar.querySelector('a[href="/d/desktop/agents"]')?.textContent).toBe(
      'Herdr',
    )
    cleanup()
  })

  it('shows GTD as a phone tab root with the tab bar', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/gtd')
    const bar = container.querySelector('.tab-bar')!
    expect(bar).toBeTruthy()
    expect(bar.querySelector('[aria-current="page"]')?.textContent).toBe('GTD')
    cleanup()
    const detail = renderShell('/d/desktop/gtd/thread-1')
    expect(detail.container.querySelector('.tab-bar')).toBeNull()
    cleanup()
  })

  it('hides the tab bar on /alma, where the header carries the avatar', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/alma')
    expect(container.querySelector('.tab-bar')).toBeNull()
    expect(container.querySelector('.detail-shell')).toBeTruthy()
    cleanup()
  })

  it('orders the rail like the phone tabs', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const labels = [
      ...container.querySelectorAll('.split-nav > a, .split-nav > button'),
    ].map((item) => item.getAttribute('aria-label'))
    expect(labels.slice(0, 3)).toEqual(['Threads', 'Herdr', 'GTD'])
    expect(labels.at(-1)).toBe('Settings')
    cleanup()
  })

  it('replaces the rail logo with the avatar on wide layouts', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const top = container.querySelector('.split-rail > :first-child')!
    expect(top.querySelector('.alma-nav-rail')).toBeTruthy()
    expect(top.querySelector('img')).toBeNull()
    cleanup()
    mocks.personal = { status: 'unsupported' }
    const plain = renderShell('/d/desktop/threads')
    expect(
      plain.container.querySelector('.split-rail > .split-logo img'),
    ).toBeTruthy()
    cleanup()
  })
})

describe('Agents navigation', () => {
  it('renders before Herdr info resolves', () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/d/desktop/threads']}>
          <AgentsNavLink desktopId="desktop" compact={false} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    const link = screen.getByRole('link', { name: 'Herdr' })
    expect(link.getAttribute('href')).toBe('/d/desktop/agents')
    expect(link.querySelector('.herdr-mark')).toBeTruthy()
    expect(link.querySelector('.lucide-square-terminal')).toBeNull()
  })
})
