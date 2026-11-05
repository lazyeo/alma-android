// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { ConnectionContext } from '../desktops/DesktopContext'
import { ScopedRootHeader } from './ScopedRootHeader'

const mocks = vi.hoisted(() => ({ mode: 'single' as 'single' | 'split' }))

vi.mock('./useLayoutMode', () => ({ useLayoutMode: () => mocks.mode }))

const desktop = (id: string, name: string, status = 'online') => ({
  pairing: { id, name },
  status,
  connection: {
    pairing: { id, name },
    status,
    transport: 'relay',
    latency: { ms: 42, at: Date.now() },
  },
})
const desktops = [
  desktop('mba', 'Alma@MBA'),
  desktop('mini', 'Alma@Mini', 'offline'),
]

vi.mock('../desktops/DesktopContext', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../desktops/DesktopContext')>()
  return {
    ...actual,
    useDesktops: () => ({
      store: { activeId: 'mba', pairings: desktops.map((d) => d.pairing) },
      desktops,
    }),
  }
})

function renderHeader(scoped = true) {
  const header = (
    <ScopedRootHeader
      title="Threads"
      desktopTitle
      actions={<button aria-label="Search" />}
    />
  )
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/d/mba/threads']}>
        {scoped ? (
          <ConnectionContext.Provider value={desktops[0].connection as never}>
            {header}
          </ConnectionContext.Provider>
        ) : (
          header
        )}
      </MemoryRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  mocks.mode = 'single'
  cleanup()
})

describe('phone root header desktop title', () => {
  it('shows the status dot, desktop name and chevron as the heading', () => {
    const { container } = renderHeader()
    const h1 = container.querySelector('h1.desktop-title')!
    const button = h1.querySelector('button.desktop-title-switcher')!
    expect(button.getAttribute('aria-label')).toBe(
      'Switch desktop, current: Alma@MBA',
    )
    expect(button.querySelector('.desktop-status-marker.online')).toBeTruthy()
    expect(button.querySelector('.desktop-switcher-name')?.textContent).toBe(
      'Alma@MBA',
    )
    expect(button.querySelector(':scope > svg')).toBeTruthy()
    // No transport or latency in the title, and no plain "Threads".
    expect(button.querySelector('.desktop-transport-indicator')).toBeNull()
    expect(h1.textContent).not.toContain('Threads')
    // Header actions keep their place.
    expect(screen.getByLabelText('Search')).toBeTruthy()
  })

  it('opens the desktop switcher menu', () => {
    renderHeader()
    fireEvent.click(screen.getByLabelText('Switch desktop, current: Alma@MBA'))
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
    expect(items.join('|')).toContain('Alma@MBA')
    expect(items.join('|')).toContain('Alma@Mini')
    expect(items.join('|')).toContain('Add desktop')
  })

  it('falls back to the active desktop outside a connection scope', () => {
    renderHeader(false)
    expect(
      screen.getByLabelText('Switch desktop, current: Alma@MBA'),
    ).toBeTruthy()
  })

  it('keeps the plain title in the split layout', () => {
    mocks.mode = 'split'
    const { container } = renderHeader()
    expect(container.querySelector('.desktop-title-switcher')).toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('Threads')
  })
})
