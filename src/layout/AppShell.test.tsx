// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { SLOT_FADE_MS } from '../alma/AlmaPresence'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AgentsNavLink, AppShell } from './AppShell'

const mocks = vi.hoisted(() => ({
  mode: 'split' as 'split' | 'single',
  activeId: 'desktop',
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
      activeId: mocks.activeId,
      pairings: [
        { id: 'desktop', name: 'Desktop' },
        { id: 'other', name: 'Other' },
      ],
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
  mocks.activeId = 'desktop'
})

const shell = (route: string) => (
  <LanguageProvider>
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </LanguageProvider>
)

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

const sideLabels = (bar: Element) =>
  [...bar.querySelectorAll(':scope > a')].map((a) =>
    a.getAttribute('aria-label'),
  )

describe('Alma in the navigation', () => {
  it('shows Threads and Herdr alone, centred, without a personal agent', () => {
    mocks.mode = 'single'
    mocks.personal = { status: 'unsupported' }
    const { container } = renderShell('/d/desktop/threads')
    const bar = container.querySelector('.phone-dock > .tab-bar')!
    expect(bar.classList.contains('floating-nav')).toBe(true)
    expect(bar.classList.contains('with-alma')).toBe(false)
    expect(bar.querySelector('.alma-nav')).toBeNull()
    expect(sideLabels(bar)).toEqual(['Threads', 'Herdr'])
    // Icons only: the label is the accessible name.
    expect(bar.textContent).toBe('')
    cleanup()
  })

  it('puts her face between Threads and Herdr, and nothing else', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const bar = container.querySelector('.tab-bar.with-alma')!
    const children = [...bar.children]
    expect(children).toHaveLength(3)
    expect(children.map((child) => child.className)).toEqual([
      'threads-entry active',
      'alma-nav alma-nav-tab',
      'agents-entry',
    ])
    expect(sideLabels(bar)).toEqual(['Threads', 'Herdr'])
    expect(bar.querySelector('a[href="/d/desktop/agents"]')).toBeTruthy()
    // GTD and Settings moved to the Threads header.
    expect(bar.querySelector('a[href="/d/desktop/gtd"]')).toBeNull()
    expect(bar.querySelector('a[href="/settings"]')).toBeNull()
    expect(
      bar.querySelector('[aria-current="page"]')?.getAttribute('aria-label'),
    ).toBe('Threads')
    cleanup()
  })

  it.each([
    ['GTD', '/d/desktop/gtd'],
    ['Settings', '/settings'],
  ])('opens %s as a phone child page without the tab bar', (_label, route) => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell(route)
    expect(container.querySelector('.tab-bar')).toBeNull()
    expect(container.querySelector('.detail-main.phone-child')).toBeTruthy()
    cleanup()
  })

  it('keeps GTD conversations full-screen details', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/gtd/thread-1')
    expect(container.querySelector('.tab-bar')).toBeNull()
    expect(container.querySelector('.detail-main.phone-child')).toBeNull()
    cleanup()
  })

  it('marks Herdr active on its root and keeps the bar there', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/agents')
    const bar = container.querySelector('.tab-bar')!
    expect(
      bar.querySelector('[aria-current="page"]')?.getAttribute('aria-label'),
    ).toBe('Herdr')
    expect(
      bar.querySelector('.active')?.classList.contains('agents-entry'),
    ).toBe(true)
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

  it('keeps the new-thread composer clear of the floating bar', () => {
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads?new=1')
    expect(container.querySelector('.tab-bar')).toBeNull()
    cleanup()
  })

  it('steps the bar aside while a text field has the keyboard', () => {
    vi.useFakeTimers()
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container } = render(
      <>
        <input aria-label="field" />
        {shell('/d/desktop/threads')}
      </>,
    )
    const bar = container.querySelector('.tab-bar')!
    expect(bar.getAttribute('data-hidden')).toBeNull()
    const field = screen.getByRole('textbox', { name: 'field' })
    act(() => field.focus())
    expect(bar.getAttribute('data-hidden')).toBe('true')
    expect(bar.hasAttribute('inert')).toBe(true)
    act(() => {
      field.blur()
      vi.runOnlyPendingTimers()
    })
    expect(bar.getAttribute('data-hidden')).toBeNull()
    cleanup()
    vi.useRealTimers()
  })

  it('orders the rail Threads, Alma, Herdr, then GTD and Settings at the foot', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const labels = [
      ...container.querySelectorAll('.split-nav > a, .split-nav > button'),
    ].map((item) => item.getAttribute('aria-label'))
    expect(labels.slice(0, 3)).toEqual([
      'Threads',
      'Open Alma main conversation',
      'Herdr',
    ])
    expect(labels.slice(-3)).toEqual(['Hide thread list', 'GTD', 'Settings'])
    expect(container.querySelector('.tab-bar')).toBeNull()
    cleanup()
  })

  it('keeps the rail logo and drops her item without a personal agent', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const top = container.querySelector('.split-rail > :first-child')!
    expect(top.querySelector('img')).toBeTruthy()
    expect(container.querySelector('.split-nav > .alma-nav-rail')).toBeTruthy()
    cleanup()
    // A desktop never seen with her (a known one fades her out first).
    localStorage.clear()
    mocks.personal = { status: 'unsupported' }
    const plain = renderShell('/d/desktop/threads')
    expect(
      plain.container.querySelector('.split-rail > .split-logo img'),
    ).toBeTruthy()
    expect(plain.container.querySelector('.alma-nav')).toBeNull()
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

describe('switching desktops', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('keeps the tab bar and her slot while the next desktop loads', () => {
    vi.useFakeTimers()
    mocks.mode = 'single'
    mocks.personal = readyPersonal
    const { container, rerender } = render(shell('/threads'))
    const bar = container.querySelector('.tab-bar')!
    const alma = bar.querySelector('.alma-nav')!
    const links = [...bar.querySelectorAll('a')]
    expect(alma).not.toBeNull()

    mocks.activeId = 'other'
    mocks.personal = { status: 'loading' }
    rerender(shell('/threads'))
    act(() => vi.advanceTimersByTime(2_000))
    expect(container.querySelector('.tab-bar')).toBe(bar)
    expect(bar.classList.contains('with-alma')).toBe(true)
    expect(bar.querySelector('.alma-nav')).toBe(alma)
    expect(alma.getAttribute('data-slot')).toBeNull()
    expect(alma.getAttribute('aria-disabled')).toBe('true')
    // Same link nodes: nothing was re-parented or remounted.
    expect([...bar.querySelectorAll('a')]).toEqual(links)
    links.forEach((link, index) =>
      expect(bar.querySelectorAll('a')[index]).toBe(link),
    )
    expect(bar.querySelector('a')?.getAttribute('href')).toBe(
      '/d/other/threads',
    )

    // A transient error does not hide her either.
    mocks.personal = { status: 'error' }
    rerender(shell('/threads'))
    expect(bar.querySelector('.alma-nav')).toBe(alma)

    // Confirmed unsupported: she fades, then the bar closes the gap.
    mocks.personal = { status: 'unsupported' }
    rerender(shell('/threads'))
    expect(bar.querySelector('.alma-nav')).toBe(alma)
    expect(alma.getAttribute('data-slot')).toBe('hiding')
    act(() => vi.advanceTimersByTime(SLOT_FADE_MS))
    expect(bar.querySelector('.alma-nav')).toBeNull()
    expect(container.querySelector('.tab-bar')).toBe(bar)

    // Back to a desktop known to have her: the slot returns at once.
    mocks.activeId = 'desktop'
    mocks.personal = { status: 'loading' }
    rerender(shell('/threads'))
    expect(bar.querySelector('.alma-nav')).not.toBeNull()
    // And the other desktop is remembered as without her.
    mocks.activeId = 'other'
    rerender(shell('/threads'))
    act(() => vi.advanceTimersByTime(SLOT_FADE_MS))
    expect(bar.querySelector('.alma-nav')).toBeNull()
  })
})
