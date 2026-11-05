// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { LayoutMode } from '../layout/splitLayout'
import { parentRoute } from '../navigation/parentRoute'
import { closeTopOverlay, resetOverlayStackForTests } from '../overlayStack'
import { ThreadsScreen } from './ThreadsScreen'

vi.mock('../desktops/DesktopTitleSwitcher', () => ({
  DesktopTitleSwitcher: ({ fallback }: { fallback: string }) => (
    <span className="desktop-title-stub">{fallback}</span>
  ),
}))
vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({
    api: { searchThreads: vi.fn() },
    pairing: { id: 'desk', name: 'Desk' },
  }),
}))

vi.mock('./useDesktopThreadList', () => ({
  useDesktopThreadList: () => ({
    threads: [],
    setThreads: vi.fn(),
    workspaces: [],
    settings: {},
    loading: false,
    error: '',
    setError: vi.fn(),
    reload: vi.fn(async () => undefined),
  }),
}))

vi.mock('./useTimeCluesStatus', () => ({
  useTimeCluesStatus: () => ({ supported: false, unread: false }),
}))

vi.mock('../desktops/ThreadActivityProvider', () => ({
  useUnreadActivity: () => ({ markRead: vi.fn() }),
  useGeneratingIds: () => new Set<string>(),
}))

vi.mock('../alma/AlmaPresence', () => ({ useAlmaPresence: () => null }))

vi.mock('../alma/personalThread', () => ({
  usePersonalThreadIds: () => new Set<string>(),
  excludePersonalThread: <T,>(threads: T[]) => threads,
}))

vi.mock('./ThreadListRow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ThreadListRow')>()),
  useThreadRowIndicators: () => ({
    generating: new Set<string>(),
    pendingThreadIds: new Set<string>(),
    indicatorsFor: () => ({}),
  }),
}))

vi.mock('./ThreadOrganize', () => ({
  useThreadOrganize: () => ({ setStatus: vi.fn() }),
}))

const layout = vi.hoisted(() => ({ mode: 'single' as LayoutMode }))
vi.mock('../layout/useLayoutMode', () => ({
  useLayoutMode: () => layout.mode,
}))

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderThreads() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/d/desk/threads']}>
        <Routes>
          <Route
            path="/d/desk/threads"
            element={
              <>
                <ThreadsScreen />
                <Location />
              </>
            }
          />
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

afterEach(() => {
  cleanup()
  resetOverlayStackForTests()
  layout.mode = 'single'
})

// The tab row measures itself; jsdom has no layout to observe.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
// The tab indicator re-measures once fonts load; jsdom has no FontFaceSet.
if (!document.fonts)
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })

describe('Threads header entries', () => {
  it('makes the phone heading the desktop switcher', () => {
    renderThreads()
    const h1 = document.querySelector('.scoped-root-title h1')!
    expect(h1.classList.contains('desktop-title')).toBe(true)
    expect(h1.querySelector('.desktop-title-stub')).toBeTruthy()
  })

  it('carries GTD and Settings as icon buttons that open their pages', () => {
    renderThreads()
    const actions = document.querySelector('.thread-header-actions')!
    const gtd = screen.getByRole('button', { name: 'GTD' })
    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(actions.contains(gtd) && actions.contains(settings)).toBe(true)
    // Icons only; the names are their labels.
    expect(gtd.textContent).toBe('')
    expect(settings.textContent).toBe('')
    // Hidden in split view, where the rail carries both.
    expect(gtd.classList.contains('split-header-hidden')).toBe(true)
    expect(settings.classList.contains('split-header-hidden')).toBe(true)

    fireEvent.click(gtd)
    expect(screen.getByTestId('location').textContent).toBe('/d/desk/gtd')
  })

  it('opens Settings from its gear', () => {
    renderThreads()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByTestId('location').textContent).toBe('/settings')
  })
})

// Mirrors the native backButton listener in App: the top overlay consumes
// Back first, then the route hierarchy decides; no parent means exit.
function systemBack(mode: LayoutMode) {
  let outcome: 'consumed' | 'exit' | string = 'consumed'
  act(() => {
    if (closeTopOverlay()) return
    outcome =
      parentRoute(screen.getByTestId('location').textContent!, mode) ?? 'exit'
  })
  return outcome
}

describe.each<LayoutMode>(['single', 'split'])(
  'Threads search and system Back (%s)',
  (mode) => {
    it('closes open search first, then Back on the root exits as before', () => {
      layout.mode = mode
      renderThreads()
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      const field = screen.getByRole('textbox', {
        name: 'Search threads and projects',
      })
      field.focus()
      fireEvent.change(field, { target: { value: 'notes' } })
      const header = document.querySelector('.scoped-root-header')!
      expect(header.classList.contains('searching')).toBe(true)

      expect(systemBack(mode)).toBe('consumed')
      expect(header.classList.contains('searching')).toBe(false)
      expect((field as HTMLInputElement).value).toBe('')
      expect(document.activeElement).not.toBe(field)
      expect(screen.getByTestId('location').textContent).toBe('/d/desk/threads')

      expect(systemBack(mode)).toBe('exit')
    })
  },
)
