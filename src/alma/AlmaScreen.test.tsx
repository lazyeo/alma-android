// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useContext } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { PersonalAgentState } from '../screens/personalAgent'
import {
  AlmaPresenceContext,
  AlmaPresenceProvider,
  presenceFace,
  type AlmaPresence,
  type AlmaSetupStatus,
} from './AlmaPresence'
import { AlmaScreen } from './AlmaScreen'
import { ensurePersonalThread } from './personalSetup'

const polled = vi.hoisted(() => ({
  state: { status: 'loading' } as PersonalAgentState,
  refresh: vi.fn(async () => {}),
}))

vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ pairing: { id: 'home' } }),
  useDesktops: () => ({
    store: { activeId: 'home', pairings: [] },
    desktops: [{ pairing: { id: 'home' }, connection: { api: {} } }],
  }),
}))
vi.mock('../desktops/ThreadActivityProvider', () => ({
  useGeneratingIds: () => new Set<string>(),
}))
vi.mock('../screens/usePersonalAgent', () => ({
  usePersonalAgent: () => polled,
}))
vi.mock('../screens/ThreadScreen', () => ({
  PersonaThreadScreen: ({ threadId }: { threadId: string }) => (
    <output data-testid="thread">{threadId}</output>
  ),
}))
vi.mock('./AlmaHeader', () => ({ AlmaHeader: () => <header /> }))
vi.mock('../layout/useLayoutMode', () => ({ useLayoutMode: () => 'single' }))
vi.mock('./almaExpand', () => ({ useAlmaDeferHeavy: () => false }))
vi.mock('./personalSetup', () => ({ ensurePersonalThread: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  polled.state = { status: 'loading' }
})

const ready = (threadId: string | null): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId,
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: 0,
    pendingApprovals: 0,
  },
})

const routes = (state?: unknown) => (
  <MemoryRouter initialEntries={[{ pathname: '/d/home/alma', state }]}>
    <Routes>
      <Route path="/d/home/alma" element={<AlmaScreen />} />
      <Route path="/d/home/threads" element={<p>threads list</p>} />
    </Routes>
  </MemoryRouter>
)

function renderScreen(
  state: PersonalAgentState,
  setup: AlmaSetupStatus = 'idle',
  startSetup = vi.fn(),
  {
    desktopId = 'home',
    location,
  }: { desktopId?: string; location?: unknown } = {},
) {
  const value: AlmaPresence = {
    desktopId,
    state,
    generating: false,
    face: presenceFace(state, false),
    refresh: vi.fn(async () => {}),
    setup,
    startSetup,
  }
  render(
    <LanguageProvider>
      <AlmaPresenceContext.Provider value={value}>
        {routes(location)}
      </AlmaPresenceContext.Provider>
    </LanguageProvider>,
  )
  return { startSetup, refresh: value.refresh }
}

describe('AlmaScreen setup', () => {
  it('starts setup in the shell instead of leaving when no thread is set', () => {
    const { startSetup } = renderScreen(ready(null))
    expect(startSetup).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Opening thread…')).toBeTruthy()
    expect(screen.queryByTestId('thread')).toBeNull()
    expect(screen.queryByText('threads list')).toBeNull()
  })

  it('offers a retry when setup failed and does not restart on its own', () => {
    const { startSetup } = renderScreen(ready(null), 'error')
    expect(startSetup).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      "Couldn't start the conversation",
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(startSetup).toHaveBeenCalledTimes(1)
  })

  it('opens the thread once it is known', () => {
    const { startSetup } = renderScreen(ready('main'))
    expect(startSetup).not.toHaveBeenCalled()
    expect(screen.getByTestId('thread').textContent).toBe('main')
  })

  it('goes back on a desktop without a personal agent', () => {
    renderScreen({ status: 'unsupported' })
    expect(screen.getByText('threads list')).toBeTruthy()
  })
})

// A share into her thread arrives here as router state; leaving would drop
// it without a word.
describe('AlmaScreen with a pending shared message', () => {
  const location = {
    pendingFirstSend: {
      id: 's1',
      content: 'hi',
      attachments: [],
      createdAt: 0,
    },
  }

  it('stays and says the share is unsent when she is unreachable', () => {
    const { refresh } = renderScreen(
      { status: 'error', error: 'offline' } as PersonalAgentState,
      'idle',
      vi.fn(),
      { location },
    )
    expect(screen.queryByText('threads list')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(
      'shared message hasn’t been sent',
    )
    vi.mocked(refresh).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('waits for this desktop instead of opening another desktop’s thread', () => {
    renderScreen(ready('elsewhere'), 'idle', vi.fn(), {
      desktopId: 'other',
      location,
    })
    expect(screen.queryByTestId('thread')).toBeNull()
    expect(screen.getByText('Opening thread…')).toBeTruthy()
  })
})

describe('AlmaPresenceProvider setup', () => {
  function Probe() {
    const presence = useContext(AlmaPresenceContext)!
    const threadId =
      presence.state.status === 'ready' ? presence.state.personal.threadId : ''
    return (
      <>
        <output data-testid="setup">{presence.setup}</output>
        <output data-testid="thread-id">{threadId ?? 'none'}</output>
        <button onClick={() => presence.startSetup?.()}>set up</button>
      </>
    )
  }
  const renderProvider = () =>
    render(
      <AlmaPresenceProvider>
        <Probe />
      </AlmaPresenceProvider>,
    )

  it('uses the resolved thread and refreshes the shared state', async () => {
    polled.state = ready(null)
    vi.mocked(ensurePersonalThread).mockResolvedValue({
      status: 'ready',
      threadId: 'created',
    })
    renderProvider()
    expect(screen.getByTestId('thread-id').textContent).toBe('none')
    fireEvent.click(screen.getByText('set up'))
    expect(screen.getByTestId('setup').textContent).toBe('running')
    await waitFor(() =>
      expect(screen.getByTestId('thread-id').textContent).toBe('created'),
    )
    expect(screen.getByTestId('setup').textContent).toBe('idle')
    expect(ensurePersonalThread).toHaveBeenCalledWith({}, 'home')
    expect(polled.refresh).toHaveBeenCalled()
  })

  it('reports a failure and recovers on retry', async () => {
    polled.state = ready(null)
    vi.mocked(ensurePersonalThread)
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({ status: 'ready', threadId: 'created' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderProvider()
    fireEvent.click(screen.getByText('set up'))
    await waitFor(() =>
      expect(screen.getByTestId('setup').textContent).toBe('error'),
    )
    await act(async () => fireEvent.click(screen.getByText('set up')))
    await waitFor(() =>
      expect(screen.getByTestId('thread-id').textContent).toBe('created'),
    )
  })
})
