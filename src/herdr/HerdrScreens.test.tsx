// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentPaneScreen } from './HerdrScreens'

let paneId = 'pane-a'
let agentStatus = 'idle'
let chatItems: Array<Record<string, unknown>> = [
  { id: 'm1', kind: 'assistant', text: 'Pane B transcript' },
]
const blockedMenu = `Run this command?\n> 1. Yes, run command\n  2. Yes, always allow\n  3. No, cancel`
const api = {
  getHerdrChat: vi.fn(async (target: string) =>
    target === 'pane-a'
      ? { error: { code: 'unsupported_agent' } }
      : {
          page: {
            items: chatItems,
            start: 0,
            end: chatItems.length,
          },
          queued: [],
        },
  ),
  openJsonSocket: vi.fn(() => ({
    opened: new Promise<void>(() => undefined),
    close: vi.fn(),
  })),
  readHerdrPane: vi.fn(async () => ({ read: { text: '' } })),
  chooseHerdrMenuOption: vi.fn(async () => undefined),
}

const location = { pathname: '/d/desktop/agents/pane-a', key: 'initial' }
vi.mock('react-router-dom', () => ({
  useParams: () => ({ desktopId: 'desktop', paneId }),
  useLocation: () => location,
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
            { pane_id: 'pane-b', agent: 'claude', agent_status: agentStatus },
          ],
        },
      },
    },
  }),
}))
vi.mock('../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../layout/ScopedRootHeader', () => ({
  ScopedRootHeader: ({
    title,
    actions,
  }: {
    title: string
    actions: unknown
  }) => (
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
  TerminalView: ({ frame }: { frame?: { text?: string } }) => (
    <div data-testid="terminal">{frame?.text}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  agentStatus = 'idle'
  chatItems = [{ id: 'm1', kind: 'assistant', text: 'Pane B transcript' }]
})

describe('AgentPaneScreen pane navigation', () => {
  it('resets unsupported chat state and loads the next pane transcript', async () => {
    paneId = 'pane-a'
    const view = render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    paneId = 'pane-b'
    view.rerender(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: 'agents.chat' })).toBeTruthy()
  })

  it('renders chat rows through shared messages while keeping questions host-owned', async () => {
    paneId = 'pane-b'
    chatItems = [
      { id: 'u1', kind: 'user', text: 'Run the checks.' },
      { id: 'a1', kind: 'assistant', text: '**All good.**' },
      {
        id: 't1',
        kind: 'tool',
        tool: {
          name: 'Bash',
          input: { command: 'npm test' },
          result: 'passed',
          done: true,
        },
      },
      {
        id: 'q1',
        kind: 'tool',
        tool: {
          name: 'request_user_input',
          input: {
            questions: [{ question: 'Ship it?', options: ['Yes', 'No'] }],
          },
        },
      },
    ]

    const view = render(<AgentPaneScreen />)

    await waitFor(() => expect(screen.getByText('**All good.**')).toBeTruthy())
    expect(view.container.querySelectorAll('.message.user')).toHaveLength(1)
    expect(view.container.querySelectorAll('.message.assistant')).toHaveLength(
      3,
    )
    expect(view.container.querySelector('.tool-card.done')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy()
    expect(view.container.querySelector('.agent-question')).toBeTruthy()
    expect(view.container.querySelector('.message-actions-button')).toBeNull()
    expect(view.container.querySelector('.version-switcher')).toBeNull()
    expect(view.container.querySelector('.usage')).toBeNull()
  })

  it('keeps the route and history entry unchanged when the view toggles', async () => {
    paneId = 'pane-b'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )
    const before = { ...location, length: window.history.length }

    fireEvent.click(screen.getByRole('button', { name: 'agents.terminal' }))

    expect(location).toEqual({ pathname: before.pathname, key: before.key })
    expect(window.history.length).toBe(before.length)
  })

  it('shows every blocked option in chat, highlights the cursor, and hides the card in terminal', async () => {
    paneId = 'pane-b'
    agentStatus = 'blocked'
    api.readHerdrPane.mockResolvedValueOnce({ read: { text: blockedMenu } })
    render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('Run this command?')).toBeTruthy(),
    )
    const selected = screen.getByRole('button', { name: '1. Yes, run command' })
    expect(selected.className).toContain('active')
    expect(
      screen.getByRole('button', { name: '2. Yes, always allow' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '3. No, cancel' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'agents.terminal' }))
    expect(screen.queryByText('Run this command?')).toBeNull()
  })

  it('requests recent ANSI history for the current display mode', async () => {
    paneId = 'pane-a'
    api.readHerdrPane.mockResolvedValueOnce({
      read: { text: 'earlier output\nvisible output' },
    })
    render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'agents.loadEarlierOutput' }),
    )

    await waitFor(() =>
      expect(api.readHerdrPane).toHaveBeenCalledWith('pane-a', 'ansi', {
        source: 'recent_unwrapped',
        lines: 2000,
      }),
    )
  })

  it('shows the empty-history hint when the agent only redraws the visible screen', async () => {
    paneId = 'pane-a'
    api.readHerdrPane.mockResolvedValueOnce({ read: { text: '' } })
    render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'agents.loadEarlierOutput' }),
    )

    await waitFor(() =>
      expect(screen.getByText('agents.noEarlierOutput')).toBeTruthy(),
    )
  })
})
