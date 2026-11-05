// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { SLOT_FADE_MS } from '../alma/AlmaPresence'
import { clearExpandDisc, lastExpandDisc } from '../alma/almaExpand'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AgentsNavLink, AppShell } from './AppShell'

const mocks = vi.hoisted(() => ({
  mode: 'split' as 'split' | 'single',
  activeId: 'desktop',
  personal: { status: 'unsupported' } as PersonalAgentState,
  desktops: [] as {
    pairing: { id: string; name: string }
    connection?: object
  }[],
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
    desktops: mocks.desktops,
  }),
}))

vi.mock('../desktops/DesktopSwitcher', () => ({
  DesktopSwitcher: ({ className }: { className?: string }) => (
    <button className={`desktop-switcher ${className ?? ''}`} />
  ),
}))

vi.mock('./useLayoutMode', () => ({
  useLayoutMode: () => mocks.mode,
  useSidebarCollapsed: () => [false, vi.fn(), vi.fn()],
}))

vi.mock('./useSidebarSwipe', () => ({
  // A marker attribute stands in for the pointer handlers it returns.
  useSidebarSwipe: () => ({ 'data-sidebar-swipe': '' }),
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

describe('desktop switcher placement', () => {
  const connected = [
    { pairing: { id: 'desktop', name: 'Desktop' }, connection: {} },
  ]
  afterEach(() => {
    mocks.desktops = []
    cleanup()
  })

  it('keeps the phone dock to the pill and the safe area', () => {
    mocks.mode = 'single'
    mocks.desktops = connected
    const { container } = renderShell('/d/desktop/threads')
    const dock = container.querySelector('.phone-dock')!
    expect(container.querySelector('.desktop-strip')).toBeNull()
    expect(dock.children).toHaveLength(1)
    expect(dock.firstElementChild?.classList.contains('tab-bar')).toBe(true)
  })
})

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

  it('orders the rail Threads, Herdr, then GTD and Settings at the foot', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const labels = [
      ...container.querySelectorAll('.split-nav > a, .split-nav > button'),
    ].map((item) => item.getAttribute('aria-label'))
    expect(labels.slice(0, 2)).toEqual(['Threads', 'Herdr'])
    expect(labels.slice(-3)).toEqual(['Hide thread list', 'GTD', 'Settings'])
    // She is in the top slot only, never a second time in the list.
    expect(container.querySelector('.split-nav .alma-nav')).toBeNull()
    expect(container.querySelectorAll('.split-rail .alma-nav')).toHaveLength(1)
    expect(container.querySelector('.tab-bar')).toBeNull()
    cleanup()
  })

  it('puts her face in the rail top slot over the logo', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    const top = container.querySelector('.split-rail > :first-child')!
    expect(top.classList.contains('split-logo')).toBe(true)
    expect(top.getAttribute('data-alma')).toBe('true')
    const alma = top.querySelector(':scope > .alma-nav-rail')!
    expect(alma.getAttribute('aria-label')).toBe('Open Alma main conversation')
    expect(alma.querySelector('.alma-avatar svg')?.getAttribute('width')).toBe(
      '40',
    )
    // The logo stays mounted under her and only fades, so the slot keeps
    // one size in both states.
    const mark = top.querySelector(':scope > .split-logo-mark')!
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.querySelector('img')).toBeTruthy()
    expect(top.hasAttribute('aria-hidden')).toBe(false)
    cleanup()
  })

  it('shows the logo in the top slot without a personal agent', () => {
    mocks.mode = 'split'
    // A desktop never seen with her (a known one fades her out first).
    localStorage.clear()
    mocks.personal = { status: 'unsupported' }
    const { container } = renderShell('/d/desktop/threads')
    const top = container.querySelector('.split-rail > .split-logo')!
    expect(top.hasAttribute('data-alma')).toBe(false)
    expect(top.querySelector('.split-logo-mark img')).toBeTruthy()
    expect(container.querySelector('.alma-nav')).toBeNull()
    const labels = [
      ...container.querySelectorAll('.split-nav > a, .split-nav > button'),
    ].map((item) => item.getAttribute('aria-label'))
    expect(labels.slice(0, 2)).toEqual(['Threads', 'Herdr'])
    cleanup()
  })

  it('marks the top slot active on her screen and nothing else', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/alma')
    const current = container.querySelectorAll(
      '.split-rail [aria-current="page"]',
    )
    expect(current).toHaveLength(1)
    expect(current[0].closest('.split-logo')).toBeTruthy()
    expect(current[0].classList.contains('active')).toBe(true)
    cleanup()
  })

  it('starts the expand from her face in the top slot', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const observed: Array<() => void> = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: () => void) {}
        observe() {
          observed.push(this.callback)
        }
        disconnect() {}
      },
    )
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return (
          this.matches('.split-logo .alma-avatar')
            ? { left: 12, top: 10, width: 40, height: 40 }
            : { left: 0, top: 0, width: 0, height: 0 }
        ) as DOMRect
      })
    renderShell('/d/desktop/threads')
    for (const callback of observed) callback()
    expect(lastExpandDisc()).toMatchObject({ left: 12, top: 10, width: 40 })
    rect.mockRestore()
    vi.unstubAllGlobals()
    clearExpandDisc()
    cleanup()
  })
})

describe('Alma on split layouts', () => {
  it('fills the content area: the list folds away and swipe is off', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/alma')
    const shell = container.querySelector('.split-shell')!
    expect(shell.classList.contains('alma-full')).toBe(true)
    expect(shell.hasAttribute('data-sidebar-swipe')).toBe(false)
    const sidebar = container.querySelector('.split-sidebar')!
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(sidebar.hasAttribute('inert')).toBe(true)
    const toggle = container.querySelector<HTMLButtonElement>('.split-toggle')!
    expect(toggle.disabled).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    cleanup()
  })

  it('shows one face: docked across the rail edge, the rail slot hidden', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/alma')
    const docks = container.querySelectorAll('.split-shell > .alma-dock')
    expect(docks).toHaveLength(1)
    const dock = docks[0]
    // Outside the panes that recede and hand off, so there is only one.
    expect(dock.closest('.split-main, .split-sidebar')).toBeNull()
    const face = dock.querySelector('[data-alma-avatar="header"]')!
    expect(face.querySelector('svg')?.getAttribute('width')).toBe('52')
    expect(dock.classList.contains('alma-avatar-flight')).toBe(true)
    // The rail slot keeps its box but is no flight end; CSS hides its face.
    const slot = container.querySelector('.split-rail .alma-nav-rail')!
    expect(slot.querySelector('[data-alma-avatar]')).toBeNull()
    expect(slot.querySelector('.alma-avatar')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(css).toMatch(
      /\.split-shell\.alma-full \.alma-nav-rail \.alma-avatar \{\s*opacity: 0;/,
    )
    expect(css).toMatch(
      /\.split-shell\.alma-full \.alma-nav-rail \.alma-nav-busy \{\s*visibility: hidden;/,
    )
    const hidden = '.split-shell.alma-full .alma-nav-rail .alma-avatar'
    const visible = [...container.querySelectorAll('.alma-avatar')].filter(
      (element) => !element.matches(hidden),
    )
    expect(visible).toEqual([face])
    cleanup()
  })

  it('keeps her face in the slot off /alma and has no dock on a phone', () => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell('/d/desktop/threads')
    expect(container.querySelector('.alma-dock')).toBeNull()
    expect(
      container.querySelector('.alma-nav-rail [data-alma-avatar="nav"]'),
    ).toBeTruthy()
    cleanup()
    mocks.mode = 'single'
    const phone = renderShell('/d/desktop/alma')
    expect(phone.container.querySelector('.alma-dock')).toBeNull()
    cleanup()
  })

  it.each([
    ['threads', '/d/desktop/threads'],
    ['thread detail', '/d/desktop/threads/thread-1'],
    ['GTD', '/d/desktop/gtd'],
    ['Herdr', '/d/desktop/agents'],
    ['settings', '/settings'],
  ])('keeps the list and its swipe on %s', (_label, route) => {
    mocks.mode = 'split'
    mocks.personal = readyPersonal
    const { container } = renderShell(route)
    const shell = container.querySelector('.split-shell')!
    expect(shell.classList.contains('alma-full')).toBe(false)
    expect(shell.hasAttribute('data-sidebar-swipe')).toBe(true)
    expect(
      container.querySelector('.split-sidebar')!.hasAttribute('inert'),
    ).toBe(false)
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
