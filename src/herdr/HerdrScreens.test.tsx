// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentPaneScreen } from './HerdrScreens'

let paneId = 'pane-a'
const api = {
  getHerdrChat: vi.fn(async (target: string) =>
    target === 'pane-a'
      ? { error: { code: 'unsupported_agent' } }
      : {
          page: {
            items: [{ id: 'm1', kind: 'assistant', text: 'Pane B transcript' }],
            start: 0,
            end: 1,
          },
          queued: [],
        },
  ),
  openJsonSocket: vi.fn(() => ({
    opened: new Promise<void>(() => undefined),
    close: vi.fn(),
  })),
  readHerdrPane: vi.fn(async () => ({ read: { text: '' } })),
}

vi.mock('react-router-dom', () => ({
  useParams: () => ({ desktopId: 'desktop', paneId }),
}))
vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api }),
}))
vi.mock('./HerdrProvider', () => ({
  useHerdr: () => ({
    byDesktop: {
      desktop: {
        snapshot: {
          panes: [
            { pane_id: 'pane-a', agent: 'agy', agent_status: 'idle' },
            { pane_id: 'pane-b', agent: 'claude', agent_status: 'idle' },
          ],
        },
      },
    },
  }),
}))
vi.mock('../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../layout/ScopedRootHeader', () => ({
  ScopedRootHeader: ({ title, actions }: { title: string; actions: unknown }) => (
    <header>
      <h1>{title}</h1>
      {actions as React.ReactNode}
    </header>
  ),
}))
vi.mock('../screens/MarkdownContent', () => ({
  MarkdownContent: ({ text }: { text: string }) => <span>{text}</span>,
}))
vi.mock('../terminal/TerminalView', () => ({
  TerminalView: () => <div data-testid="terminal" />,
}))

describe('AgentPaneScreen pane navigation', () => {
  it('resets unsupported chat state and loads the next pane transcript', async () => {
    paneId = 'pane-a'
    const view = render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    paneId = 'pane-b'
    view.rerender(<AgentPaneScreen />)

    await waitFor(() => expect(screen.getByText('Pane B transcript')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'agents.chat' })).toBeTruthy()
  })
})
