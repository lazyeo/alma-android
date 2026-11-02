// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPaneScreen } from './HerdrScreens'

let paneId = 'pane-a'
let agentStatus = 'idle'
let chatItems: Array<Record<string, unknown>> = [
  { id: 'm1', kind: 'assistant', text: 'Pane B transcript' },
]
const blockedMenu = `Run this command?\n> 1. Yes, run command\n  2. Yes, always allow\n  3. No, cancel`
const api = {
  promptHerdrAgent: vi.fn(async () => undefined),
  herdrUpload: vi.fn(async (_bytes, _mediaType, name) => ({
    path: `/desktop/uploads/${name}`,
  })),
  herdrUploadChunked: vi.fn(async (_bytes, _mediaType, name) => ({
    path: `/desktop/uploads/${name}`,
  })),
  getImage: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
  getHerdrCommands: vi.fn(async () => ({
    commands: [
      {
        name: 'review',
        description: 'Review the current changes',
        source: 'command',
      },
      {
        name: 'prompts:release',
        description: 'Prepare a release',
        source: 'prompt',
      },
    ],
  })),
  sendHerdrBlockedText: vi.fn(async () => undefined),
  sendHerdrPaneText: vi.fn(async () => undefined),
  sendHerdrPaneKeys: vi.fn(async () => undefined),
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
            {
              pane_id: 'pane-b',
              agent: 'claude',
              agent_status: agentStatus,
              turn_title: 'Ship safer command approvals',
            },
            {
              pane_id: 'pane-c',
              agent: 'codex',
              agent_status: 'idle',
            },
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
    title: React.ReactNode
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

const storage = new Map<string, string>()

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
  fireEvent(document, new Event('visibilitychange'))
}

beforeEach(() => {
  setVisibility('visible')
  storage.clear()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:attachment'),
    revokeObjectURL: vi.fn(),
  })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
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
    // The reply's text, tool and question form one assistant turn.
    expect(view.container.querySelectorAll('.message.assistant')).toHaveLength(
      1,
    )
    expect(view.container.querySelector('.tool-card.done')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy()
    expect(view.container.querySelector('.agent-question')).toBeTruthy()
    expect(view.container.querySelector('.message-actions-button')).toBeNull()
    expect(view.container.querySelector('.version-switcher')).toBeNull()
    expect(view.container.querySelector('.usage')).toBeNull()
  })

  it('pauses working pane reads while hidden and resumes immediately when visible', async () => {
    vi.useFakeTimers()
    paneId = 'pane-b'
    agentStatus = 'working'
    api.readHerdrPane.mockResolvedValue({
      read: { text: '✻ Reading files… (42s · esc to interrupt)' },
    })

    render(<AgentPaneScreen />)
    await vi.waitFor(() => expect(api.readHerdrPane).toHaveBeenCalledTimes(1))

    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(6_000)
    expect(api.readHerdrPane).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await vi.waitFor(() => expect(api.readHerdrPane).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(api.readHerdrPane).toHaveBeenCalledTimes(3)
  })

  it('stops a working pane with escape from the chat activity bar', async () => {
    paneId = 'pane-b'
    agentStatus = 'working'
    api.readHerdrPane.mockResolvedValueOnce({
      read: { text: '✻ Reading files… (42s · esc to interrupt)' },
    })
    render(<AgentPaneScreen />)

    const stop = await screen.findByRole('button', { name: 'agents.stop' })
    fireEvent.click(stop)

    await waitFor(() =>
      expect(api.sendHerdrPaneKeys).toHaveBeenCalledWith('pane-b', ['esc']),
    )
  })

  it('renders chat and terminal as one segmented view switch', async () => {
    paneId = 'pane-b'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )
    const switcher = screen.getByRole('group', { name: 'agents.view' })
    const chat = screen.getByRole('button', { name: 'agents.chat' })
    const terminal = screen.getByRole('button', { name: 'agents.terminal' })

    expect(switcher.className).toContain('agent-view-toggle')
    expect(chat.getAttribute('aria-pressed')).toBe('true')
    expect(terminal.getAttribute('aria-pressed')).toBe('false')

    const before = { ...location, length: window.history.length }
    fireEvent.click(terminal)

    expect(chat.getAttribute('aria-pressed')).toBe('false')
    expect(terminal.getAttribute('aria-pressed')).toBe('true')
    expect(location).toEqual({ pathname: before.pathname, key: before.key })
    expect(window.history.length).toBe(before.length)
  })

  it('shows only the terminal segment when chat is unsupported', async () => {
    paneId = 'pane-a'
    render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    expect(screen.queryByRole('button', { name: 'agents.chat' })).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'agents.terminal' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('shows every blocked option in chat, highlights the cursor, and hides the card in terminal', async () => {
    paneId = 'pane-b'
    agentStatus = 'blocked'
    api.readHerdrPane.mockResolvedValueOnce({ read: { text: blockedMenu } })
    render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('Run this command?')).toBeTruthy(),
    )
    expect(screen.getByText('Ship safer command approvals')).toBeTruthy()
    const selected = screen.getByRole('button', { name: '1. Yes, run command' })
    expect(selected.className).toContain('active')
    expect(
      screen.getByRole('button', { name: '2. Yes, always allow' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '3. No, cancel' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'agents.terminal' }))
    expect(screen.queryByText('Run this command?')).toBeNull()
  })

  it('floats the display mode control over the terminal instead of the key row', async () => {
    paneId = 'pane-a'
    const view = render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    const mode = screen.getByRole('button', {
      name: 'agents.terminalUseGrid',
    })
    const toolbar = screen.getByRole('toolbar', {
      name: 'agents.terminalKeys',
    })

    expect(mode.closest('.agent-terminal-card')).toBeTruthy()
    expect(mode.closest('.agent-terminal-scroll')).toBeNull()
    expect(toolbar.contains(mode)).toBe(false)
    expect(mode.hasAttribute('data-sidebar-swipe-exclude')).toBe(true)
    expect(mode.querySelector('span')?.textContent).toBe(
      'agents.terminalModeFit',
    )
    expect(view.container.querySelector('.agent-terminal-mode')).toBe(mode)
  })

  it('toggles and persists the terminal key row from the start of the composer', async () => {
    storage.set('alma.agents.composer-hidden', 'true')
    paneId = 'pane-b'
    const view = render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'agents.terminal' }))

    const composer = view.container.querySelector('.agent-composer')
    const hide = screen.getByRole('button', { name: 'agents.hideKeys' })
    expect(composer?.firstElementChild).toBe(hide)
    expect(hide.querySelector('.lucide-keyboard-off')).toBeTruthy()
    expect(
      screen.getByRole('toolbar', { name: 'agents.terminalKeys' }),
    ).toBeTruthy()

    fireEvent.click(hide)
    expect(view.container.querySelector('.agent-composer')).toBeTruthy()
    expect(
      screen.queryByRole('toolbar', { name: 'agents.terminalKeys' }),
    ).toBeNull()
    const show = screen.getByRole('button', { name: 'agents.showKeys' })
    expect(show.querySelector('.lucide-keyboard')).toBeTruthy()
    expect(localStorage.getItem('alma.agents.keys-hidden')).toBe('true')
    expect(localStorage.getItem('alma.agents.composer-hidden')).toBe('true')
  })

  it('restores the persisted terminal key row state while keeping the composer visible', async () => {
    storage.set('alma.agents.keys-hidden', 'true')
    paneId = 'pane-a'
    const view = render(<AgentPaneScreen />)

    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    expect(view.container.querySelector('.agent-composer')).toBeTruthy()
    expect(
      screen.queryByRole('toolbar', { name: 'agents.terminalKeys' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'agents.showKeys' })).toBeTruthy()
  })

  it('opens, closes, and selects slash commands without sending', async () => {
    paneId = 'pane-b'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.focus(composer)
    fireEvent.change(composer, { target: { value: '/' } })

    const list = await screen.findByRole('listbox', {
      name: 'agents.commands',
    })
    expect(list).toBeTruthy()
    expect(api.getHerdrCommands).toHaveBeenCalledWith('claude', 'pane-b')
    expect(screen.getByText('/review')).toBeTruthy()
    expect(screen.getByText('<model>')).toBeTruthy()

    fireEvent.change(composer, { target: { value: '/rev' } })
    expect(screen.getByText('/review')).toBeTruthy()
    expect(screen.queryByText('/prompts:release')).toBeNull()

    fireEvent.keyDown(composer, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.change(composer, { target: { value: '/' } })
    const option = await screen.findByRole('option', { name: /\/review/ })
    fireEvent.mouseDown(option)

    expect((composer as HTMLTextAreaElement).value).toBe('/review ')
    expect(document.activeElement).toBe(composer)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(api.promptHerdrAgent).not.toHaveBeenCalled()

    fireEvent.change(composer, { target: { value: '/' } })
    await screen.findByRole('listbox')
    expect(api.getHerdrCommands).toHaveBeenCalledTimes(1)
  })

  it('shows built-in commands when the desktop returns none', async () => {
    paneId = 'pane-b'
    api.getHerdrCommands.mockResolvedValueOnce({ commands: [] })
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.focus(composer)
    fireEvent.change(composer, { target: { value: '/mod' } })

    expect(await screen.findByText('/model')).toBeTruthy()
    expect(
      screen.getAllByText('agents.commandSource.builtin').length,
    ).toBeGreaterThan(0)
  })

  it('shows built-in commands when the desktop command request fails', async () => {
    paneId = 'pane-b'
    api.getHerdrCommands.mockRejectedValueOnce(new Error('404'))
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.focus(composer)
    fireEvent.change(composer, { target: { value: '/mod' } })

    expect(await screen.findByText('/model')).toBeTruthy()
    expect(screen.queryByText('agents.commandsEmpty')).toBeNull()
  })

  it('closes slash commands on space and blur', async () => {
    paneId = 'pane-b'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.focus(composer)
    fireEvent.change(composer, { target: { value: '/' } })
    await screen.findByRole('listbox')
    fireEvent.change(composer, { target: { value: '/review ' } })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.change(composer, { target: { value: '/' } })
    await screen.findByRole('listbox')
    fireEvent.blur(composer)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('blocks chat send while a cursor menu is open and keeps the draft', async () => {
    paneId = 'pane-c'
    api.readHerdrPane.mockResolvedValueOnce({
      read: {
        text: 'Choose a model\n  gpt-5.4\n› gpt-5.3-codex\n  gpt-5.2\nenter select · esc close',
      },
    })
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.change(composer, { target: { value: 'hello menu' } })
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))

    expect(
      await screen.findByRole('dialog', { name: 'agents.menuOpenTitle' }),
    ).toBeTruthy()
    expect(api.promptHerdrAgent).not.toHaveBeenCalled()
    expect((composer as HTMLTextAreaElement).value).toBe('hello menu')
  })

  it('closes an open cursor menu before sending the original draft', async () => {
    paneId = 'pane-c'
    api.readHerdrPane
      .mockResolvedValueOnce({
        read: {
          text: 'Choose a model\n  gpt-5.4\n› gpt-5.3-codex\n  gpt-5.2\nenter select · esc close',
        },
      })
      .mockResolvedValueOnce({ read: { text: '» Ask Codex to do anything' } })
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.change(composer, { target: { value: 'send after close' } })
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'agents.menuCloseAndSend' }),
    )

    await waitFor(() =>
      expect(api.sendHerdrPaneKeys).toHaveBeenCalledWith('pane-c', ['esc']),
    )
    await waitFor(() =>
      expect(api.promptHerdrAgent).toHaveBeenCalledWith(
        'pane-c',
        'send after close',
      ),
    )
  })

  it('falls through to send when the best-effort pane read fails', async () => {
    paneId = 'pane-c'
    api.readHerdrPane.mockRejectedValueOnce(new Error('read failed'))
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.change(composer, { target: { value: 'send anyway' } })
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))

    await waitFor(() =>
      expect(api.promptHerdrAgent).toHaveBeenCalledWith(
        'pane-c',
        'send anyway',
      ),
    )
  })

  it('switches to the terminal after sending an interactive built-in command', async () => {
    paneId = 'pane-c'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.change(composer, { target: { value: '/model' } })
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))

    await waitFor(() =>
      expect(api.promptHerdrAgent).toHaveBeenCalledWith('pane-c', '/model'),
    )
    expect(
      screen
        .getByRole('button', { name: 'agents.terminal' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('keeps chat open after sending a non-interactive built-in command', async () => {
    paneId = 'pane-c'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.change(composer, { target: { value: '/compact' } })
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))

    await waitFor(() =>
      expect(api.promptHerdrAgent).toHaveBeenCalledWith('pane-c', '/compact'),
    )
    expect(
      screen
        .getByRole('button', { name: 'agents.chat' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('sends chat drafts as prompts and terminal drafts as text followed by Enter', async () => {
    paneId = 'pane-b'
    const view = render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const chatComposer = screen.getByRole('textbox', {
      name: 'agents.message',
    })
    fireEvent.change(chatComposer, { target: { value: 'chat prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))
    await waitFor(() =>
      expect(api.promptHerdrAgent).toHaveBeenCalledWith(
        'pane-b',
        'chat prompt',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'agents.terminal' }))
    const terminalComposer = screen.getByRole('textbox', {
      name: 'agents.terminalText',
    })
    const enter = screen.getByRole('button', { name: 'agents.enter' })
    expect(view.container.querySelector('.agent-composer-mode')).toBeNull()
    expect(enter.querySelector('.lucide-corner-down-left')).toBeTruthy()

    fireEvent.change(terminalComposer, { target: { value: 'ls -la' } })
    fireEvent.click(enter)
    await waitFor(() =>
      expect(api.sendHerdrPaneText).toHaveBeenCalledWith('pane-b', 'ls -la'),
    )
    expect(api.sendHerdrPaneKeys).toHaveBeenCalledWith('pane-b', ['enter'])
  })

  it('uploads pending chat files at send and preserves the draft on failure', async () => {
    paneId = 'pane-b'
    const view = render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )

    const files = view.container.querySelector(
      'input[type="file"]:not([accept])',
    ) as HTMLInputElement
    const attachment = new File(['hello'], 'hello world.txt', {
      type: 'text/plain',
    })
    Object.defineProperty(files, 'files', {
      configurable: true,
      value: [attachment],
    })
    fireEvent.change(files)
    await waitFor(() =>
      expect(screen.getByText('hello world.txt')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', { name: 'agents.message' })
    fireEvent.change(composer, { target: { value: 'review it' } })
    api.herdrUpload.mockRejectedValueOnce(new Error('upload failed'))
    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))

    await waitFor(() => expect(screen.getByText('upload failed')).toBeTruthy())
    expect((composer as HTMLTextAreaElement).value).toBe('review it')
    expect(screen.getByText('hello world.txt')).toBeTruthy()
    expect(api.promptHerdrAgent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'agents.send' }))
    await waitFor(() =>
      expect(api.promptHerdrAgent).toHaveBeenCalledWith(
        'pane-b',
        '"/desktop/uploads/hello world.txt" review it',
      ),
    )
    expect((composer as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('hello world.txt')).toBeNull()
  })

  it('shows attachments only for supported chat panes', async () => {
    paneId = 'pane-b'
    const view = render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('Pane B transcript')).toBeTruthy(),
    )
    expect(
      screen.getByRole('button', { name: 'composer.attachments.add' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'agents.terminal' }))
    expect(
      screen.queryByRole('button', { name: 'composer.attachments.add' }),
    ).toBeNull()

    paneId = 'pane-a'
    view.rerender(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )
    expect(
      screen.queryByRole('button', { name: 'composer.attachments.add' }),
    ).toBeNull()
  })

  it('forwards Backspace from an empty terminal composer', async () => {
    paneId = 'pane-a'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', {
      name: 'agents.terminalText',
    })
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    composer.dispatchEvent(event)

    await waitFor(() =>
      expect(api.sendHerdrPaneKeys).toHaveBeenCalledWith('pane-a', [
        'backspace',
      ]),
    )
    expect(event.defaultPrevented).toBe(true)
  })

  it('lets Backspace edit a non-empty terminal composer', async () => {
    paneId = 'pane-a'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )

    const composer = screen.getByRole('textbox', {
      name: 'agents.terminalText',
    })
    fireEvent.change(composer, { target: { value: 'ls' } })
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    composer.dispatchEvent(event)

    expect(api.sendHerdrPaneKeys).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('puts Backspace before Tab in the terminal key row', async () => {
    paneId = 'pane-a'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )

    const labels = Array.from(
      screen
        .getByRole('toolbar', { name: 'agents.terminalKeys' })
        .querySelectorAll('button'),
      (button) => button.getAttribute('aria-label'),
    )
    expect(labels).toEqual([
      'agents.terminalKeyEscape',
      'agents.terminalKeyInterrupt',
      'agents.terminalKeyEnter',
      'agents.terminalKeyBackspace',
      'agents.terminalKeyTab',
      'agents.terminalKeyBacktab',
      'agents.terminalKeyUp',
      'agents.terminalKeyDown',
      'agents.terminalKeyLeft',
      'agents.terminalKeyRight',
    ])
  })

  it('sends a bare Enter from an empty terminal composer', async () => {
    paneId = 'pane-a'
    render(<AgentPaneScreen />)
    await waitFor(() =>
      expect(screen.getByText('agents.chatUnsupported')).toBeTruthy(),
    )

    const enter = screen.getByRole('button', { name: 'agents.enter' })
    expect(enter.hasAttribute('disabled')).toBe(false)
    fireEvent.click(enter)

    await waitFor(() =>
      expect(api.sendHerdrPaneKeys).toHaveBeenCalledWith('pane-a', ['enter']),
    )
    expect(api.sendHerdrPaneText).not.toHaveBeenCalled()
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
