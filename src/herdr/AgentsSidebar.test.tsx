// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionContext } from '../desktops/DesktopContext'
import { LanguageProvider } from '../i18n'
import type { AlmaApi } from '../relay/almaApi'
import { AgentsSidebar } from './AgentsSidebar'
import { HerdrProvider } from './HerdrProvider'
import type { HerdrSnapshot } from './model'

const snapshot = (): HerdrSnapshot => ({
  workspaces: [
    { workspace_id: 'workspace-a', label: 'Project A' },
    { workspace_id: 'workspace-b', label: 'Project B' },
    { workspace_id: 'workspace-c', label: 'Project C' },
  ],
  tabs: [
    { tab_id: 'tab-a', workspace_id: 'workspace-a' },
    { tab_id: 'tab-b', workspace_id: 'workspace-b' },
    { tab_id: 'tab-c', workspace_id: 'workspace-c' },
  ],
  panes: [
    {
      pane_id: 'pane-a',
      workspace_id: 'workspace-a',
      tab_id: 'tab-a',
      agent: 'claude',
      agent_status: 'idle',
      terminal_title_stripped: 'Session A',
    },
    {
      pane_id: 'pane-b',
      workspace_id: 'workspace-b',
      tab_id: 'tab-b',
      agent: 'claude',
      agent_status: 'idle',
      terminal_title_stripped: 'Session B',
    },
    {
      pane_id: 'pane-c',
      workspace_id: 'workspace-c',
      tab_id: 'tab-c',
      agent: 'claude',
      agent_status: 'idle',
      terminal_title_stripped: 'Session C',
    },
  ],
})

function NavigateToPaneB() {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate('/d/desktop/agents/pane-b')}>
      Open pane B
    </button>
  )
}

describe('AgentsSidebar project selection', () => {
  afterEach(cleanup)
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    })
  })

  it('keeps a user-selected project across fresh snapshots and follows pane navigation', async () => {
    let onHerdrEvent: ((event: Record<string, unknown>) => void) | undefined
    const api = {
      getHerdrInfo: vi.fn(async () => ({ online: true })),
      getHerdrMutes: vi.fn(async () => ({ workspaces: [] })),
      openJsonSocket: vi.fn(
        (path: string, onEvent: (event: Record<string, unknown>) => void) => {
          if (path === '/ws/herdr') onHerdrEvent = onEvent
          return {
            opened: Promise.resolve(),
            close: vi.fn(),
            onClose: vi.fn(),
          }
        },
      ),
      setHerdrWorkspaceMuted: vi.fn(async () => ({ workspaces: [] })),
    } as unknown as AlmaApi

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/d/desktop/agents/pane-a']}>
          <ConnectionContext.Provider
            value={{
              pairing: { id: 'desktop', name: 'Mac' } as never,
              api,
              tunnel: {} as never,
              status: 'online',
              transport: 'relay',
              latency: { transport: 'relay', ms: null, sampledAt: 0 },
            }}
          >
            <HerdrProvider
              desktops={[{ id: 'desktop', name: 'Mac', online: true, api }]}
              notificationSettings={{} as never}
            >
              <NavigateToPaneB />
              <Routes>
                <Route
                  path="/d/:desktopId/agents/:paneId"
                  element={<AgentsSidebar />}
                />
              </Routes>
            </HerdrProvider>
          </ConnectionContext.Provider>
        </MemoryRouter>
      </LanguageProvider>,
    )

    await waitFor(() => expect(onHerdrEvent).toBeTypeOf('function'))
    onHerdrEvent?.({ type: 'snapshot', snapshot: snapshot() })
    await waitFor(
      () =>
        expect(
          screen
            .getByRole('tab', { name: /Project A/ })
            .getAttribute('aria-selected'),
        ).toBe('true'),
      // The first render races the snapshot under full-suite load.
      { timeout: 5_000 },
    )

    fireEvent.click(screen.getByRole('tab', { name: /Project C/ }))
    expect(screen.getByText('Session C')).toBeTruthy()

    onHerdrEvent?.({ type: 'snapshot', snapshot: snapshot() })
    await waitFor(
      () =>
        expect(
          screen
            .getByRole('tab', { name: /Project C/ })
            .getAttribute('aria-selected'),
        ).toBe('true'),
      // The first render races the snapshot under full-suite load.
      { timeout: 5_000 },
    )
    expect(screen.getByText('Session C')).toBeTruthy()
    expect(screen.queryByText('Session A')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open pane B' }))
    await waitFor(
      () =>
        expect(
          screen
            .getByRole('tab', { name: /Project B/ })
            .getAttribute('aria-selected'),
        ).toBe('true'),
      // The first render races the snapshot under full-suite load.
      { timeout: 5_000 },
    )
    expect(screen.getByText('Session B')).toBeTruthy()
  })

  it("keeps each desktop's project pick when switching desktops", async () => {
    // Herdr workspace ids are per-server, so MBA and Mini can share them.
    const events: Record<string, (event: Record<string, unknown>) => void> = {}
    const herdrApi = (desktop: string) =>
      ({
        getHerdrInfo: vi.fn(async () => ({ online: true })),
        getHerdrMutes: vi.fn(async () => ({ workspaces: [] })),
        openJsonSocket: vi.fn(
          (path: string, onEvent: (event: Record<string, unknown>) => void) => {
            if (path === '/ws/herdr') events[desktop] = onEvent
            return {
              opened: Promise.resolve(),
              close: vi.fn(),
              onClose: vi.fn(),
            }
          },
        ),
        setHerdrWorkspaceMuted: vi.fn(async () => ({ workspaces: [] })),
      }) as unknown as AlmaApi
    const mba = herdrApi('mba')
    const mini = herdrApi('mini')
    localStorage.setItem('alma.agents.selected-workspace.mini', 'workspace-b')

    function SwitchDesktop({ to }: { to: string }) {
      const navigate = useNavigate()
      return (
        <button onClick={() => navigate(`/d/${to}/agents`)}>Switch {to}</button>
      )
    }
    const selected = () =>
      screen
        .getAllByRole('tab')
        .find((tab) => tab.getAttribute('aria-selected') === 'true')
        ?.textContent

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/d/mba/agents']}>
          <ConnectionContext.Provider
            value={{
              pairing: { id: 'mba', name: 'MBA' } as never,
              api: mba,
              tunnel: {} as never,
              status: 'online',
              transport: 'relay',
              latency: { transport: 'relay', ms: null, sampledAt: 0 },
            }}
          >
            <HerdrProvider
              desktops={[
                { id: 'mba', name: 'MBA', online: true, api: mba },
                { id: 'mini', name: 'Mini', online: true, api: mini },
              ]}
              notificationSettings={{} as never}
            >
              <SwitchDesktop to="mini" />
              <SwitchDesktop to="mba" />
              {/* Rendered outside the routed outlet, as in the split layout. */}
              <Routes>
                <Route path="/d/:desktopId/*" element={<AgentsSidebar />} />
              </Routes>
            </HerdrProvider>
          </ConnectionContext.Provider>
        </MemoryRouter>
      </LanguageProvider>,
    )

    await waitFor(() => expect(events.mba && events.mini).toBeTruthy())
    events.mba({ type: 'snapshot', snapshot: snapshot() })
    events.mini({ type: 'snapshot', snapshot: snapshot() })
    await waitFor(() => expect(selected()).toMatch(/Project A/), {
      timeout: 5_000,
    })
    fireEvent.click(screen.getByRole('tab', { name: /Project C/ }))
    expect(selected()).toMatch(/Project C/)

    fireEvent.click(screen.getByRole('button', { name: 'Switch mini' }))
    await waitFor(() => expect(selected()).toMatch(/Project B/))
    expect(localStorage.getItem('alma.agents.selected-workspace.mini')).toBe(
      'workspace-b',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Switch mba' }))
    await waitFor(() => expect(selected()).toMatch(/Project C/))
  })

  it('offers the remote screen while Herdr is unreachable', async () => {
    const api = {
      getHerdrInfo: vi.fn(async () => ({ online: false })),
      getHerdrMutes: vi.fn(async () => ({ workspaces: [] })),
      openJsonSocket: vi.fn(() => ({
        opened: Promise.resolve(),
        close: vi.fn(),
        onClose: vi.fn(),
      })),
      setHerdrWorkspaceMuted: vi.fn(async () => ({ workspaces: [] })),
    } as unknown as AlmaApi

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/d/desktop/agents']}>
          <ConnectionContext.Provider
            value={{
              pairing: { id: 'desktop', name: 'Mac' } as never,
              api,
              tunnel: {} as never,
              status: 'online',
              transport: 'relay',
              latency: { transport: 'relay', ms: null, sampledAt: 0 },
            }}
          >
            <HerdrProvider
              desktops={[{ id: 'desktop', name: 'Mac', online: true, api }]}
              notificationSettings={{} as never}
            >
              <Routes>
                <Route
                  path="/d/:desktopId/agents"
                  element={<AgentsSidebar />}
                />
              </Routes>
            </HerdrProvider>
          </ConnectionContext.Provider>
        </MemoryRouter>
      </LanguageProvider>,
    )

    await waitFor(() =>
      expect(
        screen.getByText('Start herdr on the Mac, then try again.'),
      ).toBeTruthy(),
    )
    expect(
      screen.getByRole('button', { name: 'Open remote desktop' }),
    ).toBeTruthy()
  })
})
