// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { AgentsNavLink, AppShell } from './AppShell'

vi.mock('../desktops/DesktopContext', () => ({
  ConnectionContext: { Provider: ({ children }: { children: ReactNode }) => children },
  useDesktops: () => ({
    store: {
      activeId: 'desktop',
      pairings: [{ id: 'desktop', name: 'Desktop' }],
    },
    desktops: [],
  }),
}))

vi.mock('./useLayoutMode', () => ({
  useLayoutMode: () => 'split',
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
  ])('marks exactly one item active on %s', (_label, route) => {
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

describe('Agents navigation', () => {
  it('renders before Herdr info resolves', () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/d/desktop/threads']}>
          <AgentsNavLink desktopId="desktop" compact={false} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    expect(
      screen.getByRole('link', { name: 'Herdr' }).getAttribute('href'),
    ).toBe('/d/desktop/agents')
  })
})
