// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
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

vi.mock('../layout/useLayoutMode', () => ({
  useLayoutMode: () => 'single',
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

afterEach(cleanup)

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
