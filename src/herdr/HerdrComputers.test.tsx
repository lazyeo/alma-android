// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { AlmaApi } from '../relay/almaApi'
import { AgentsState } from './AgentsScreen'
import { HerdrComputerSwitcher } from './HerdrComputerSwitcher'
import { HerdrProvider, useHerdr } from './HerdrProvider'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
})

const MINI = '0123456789abcdef'
const PREFIX = `/api/herdr/computers/${MINI}`

const reply = (value: unknown, status = 200) => ({
  status,
  headers: {},
  bytes: async () => new Uint8Array(),
  text: async () => JSON.stringify(value),
  json: async <T,>() => value as T,
})

type Routes = Record<string, () => ReturnType<typeof reply>>

function desktopApi(routes: Routes) {
  const fetch = vi.fn(async (path: string) => {
    const route = routes[path.split('?')[0]]
    return route ? route() : reply({ error: 'Route not found' }, 404)
  })
  const sockets: string[] = []
  const openWebSocket = vi.fn((path: string) => {
    sockets.push(path)
    return {
      opened: new Promise<void>(() => undefined),
      onMessage: vi.fn(),
      onClose: vi.fn(),
      close: vi.fn(),
    }
  })
  const api = new AlmaApi({ fetch, openWebSocket } as never)
  return { api, fetch, sockets }
}

const herdrRoutes = (prefix: string, online = true): Routes => ({
  [`${prefix}/info`]: () => reply({ online }),
  [`${prefix}/mutes`]: () => reply({ workspaces: [] }),
  [`${prefix}/workspaces`]: () =>
    reply({
      workspaces: [
        {
          workspace_id: 'w1',
          label: 'remote work',
          chats: [
            {
              pane_id: 'w1:p1',
              tab_id: 'w1:t1',
              agent: 'claude',
              status: 'idle',
              title: 'On the studio computer',
            },
          ],
        },
      ],
    }),
})

function Agents() {
  const { agents, byDesktop, retry } = useHerdr()
  return (
    <>
      <HerdrComputerSwitcher desktopId="desk" />
      <AgentsState
        state={byDesktop.desk}
        desktopId="desk"
        onRetry={() => retry('desk')}
      />
      <ul>
        {agents('desk').flatMap((workspace) =>
          workspace.panes.map((pane) => <li key={pane.id}>{pane.title}</li>),
        )}
      </ul>
    </>
  )
}

function renderAgents(api: AlmaApi) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <HerdrProvider
          desktops={[{ id: 'desk', name: 'Laptop', online: true, api }]}
          notificationSettings={{} as never}
        >
          <Agents />
        </HerdrProvider>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  values.clear()
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Herdr computer switcher', () => {
  it('stays hidden on a desktop without the computers route (404)', async () => {
    const { api, fetch } = desktopApi(herdrRoutes('/api/herdr'))
    renderAgents(api)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/herdr/computers',
        expect.anything(),
      ),
    )
    expect(screen.queryByRole('group', { name: 'Computer for Herdr' })).toBe(
      null,
    )
  })

  it('stays hidden while only this computer is listed', async () => {
    const { api } = desktopApi({
      ...herdrRoutes('/api/herdr'),
      '/api/herdr/computers': () => reply({ computers: [] }),
    })
    renderAgents(api)
    await act(async () => undefined)
    expect(screen.queryByRole('group', { name: 'Computer for Herdr' })).toBe(
      null,
    )
  })

  it('moves every Herdr request to the chosen computer and polls it', async () => {
    const { api, fetch, sockets } = desktopApi({
      ...herdrRoutes('/api/herdr'),
      ...herdrRoutes(PREFIX),
      '/api/herdr/computers': () =>
        reply({ computers: [{ id: MINI, label: 'Studio', state: 'ready' }] }),
    })
    renderAgents(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Studio' }))

    expect(await screen.findByText('On the studio computer')).toBeTruthy()
    expect(
      screen.getByText(
        'Updates every few seconds — this computer has no live connection.',
      ),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Studio' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    const remoteCalls = fetch.mock.calls
      .map(([path]) => path as string)
      .filter((path) => path.startsWith(PREFIX))
    expect(remoteCalls).toEqual(
      expect.arrayContaining([
        `${PREFIX}/info`,
        `${PREFIX}/mutes`,
        `${PREFIX}/workspaces`,
      ]),
    )
    // Only the desktop's own socket, opened before the switch.
    expect(sockets).toEqual(['/ws/herdr'])
    expect(values.get('alma.herdr.computer.desk')).toBe(MINI)
  })

  it('restores the remembered computer and returns to this computer', async () => {
    values.set('alma.herdr.computer.desk', MINI)
    const { api, sockets } = desktopApi({
      ...herdrRoutes('/api/herdr'),
      ...herdrRoutes(PREFIX),
      '/api/herdr/computers': () =>
        reply({ computers: [{ id: MINI, label: 'Studio', state: 'ready' }] }),
    })
    renderAgents(api)
    expect(await screen.findByText('On the studio computer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'This computer' }))
    await waitFor(() => expect(sockets.at(-1)).toBe('/ws/herdr'))
    expect(values.has('alma.herdr.computer.desk')).toBe(false)
  })

  it('pauses remote polling while the page is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    values.set('alma.herdr.computer.desk', MINI)
    const { api, fetch } = desktopApi({
      ...herdrRoutes('/api/herdr'),
      ...herdrRoutes(PREFIX),
      '/api/herdr/computers': () =>
        reply({ computers: [{ id: MINI, label: 'Studio', state: 'ready' }] }),
    })
    renderAgents(api)
    expect(await screen.findByText('On the studio computer')).toBeTruthy()
    const polls = () =>
      fetch.mock.calls.filter(([path]) => path === `${PREFIX}/workspaces`)
        .length
    const before = polls()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(polls()).toBe(before)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(polls()).toBeGreaterThan(before))
  })
})

describe('Herdr computer choice under a flaky list', () => {
  const studio = () =>
    reply({ computers: [{ id: MINI, label: 'Studio', state: 'ready' }] })

  it('goes straight to the remembered computer before the list loads', async () => {
    values.set('alma.herdr.computer.desk', MINI)
    const { api, fetch } = desktopApi({
      ...herdrRoutes('/api/herdr'),
      ...herdrRoutes(PREFIX),
    })
    // The list never answers: the remembered computer is still used.
    fetch.mockImplementation(async (path: string) => {
      if (path === '/api/herdr/computers') return new Promise(() => undefined)
      const routes = { ...herdrRoutes('/api/herdr'), ...herdrRoutes(PREFIX) }
      const route = routes[path.split('?')[0]]
      return route ? route() : reply({ error: 'Route not found' }, 404)
    })
    renderAgents(api)
    expect(await screen.findByText('On the studio computer')).toBeTruthy()
  })

  it('keeps the remote computer when a list refresh fails', async () => {
    values.set('alma.herdr.computer.desk', MINI)
    let listFails = false
    const { api } = desktopApi({
      ...herdrRoutes('/api/herdr'),
      ...herdrRoutes(PREFIX),
      '/api/herdr/computers': () =>
        listFails ? reply({ error: 'relay' }, 500) : studio(),
    })
    renderAgents(api)
    expect(await screen.findByRole('button', { name: 'Studio' })).toBeTruthy()
    listFails = true
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => undefined)
    expect(
      screen
        .getByRole('button', { name: 'Studio' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText('On the studio computer')).toBeTruthy()
  })
})

describe('Herdr offline setup', () => {
  const offline = (setup: Record<string, unknown>) =>
    desktopApi({
      ...herdrRoutes('/api/herdr', false),
      '/api/herdr/setup': () => reply({ online: false, ...setup }),
    })

  it('offers install when Herdr Core is missing', async () => {
    const { api } = offline({ phase: 'missing' })
    renderAgents(api)
    expect(
      await screen.findByRole('button', { name: 'Install Herdr' }),
    ).toBeTruthy()
    expect(
      screen.getByText('Herdr isn’t installed on this computer.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start Herdr' })).toBe(null)
  })

  it('offers start when Herdr Core is installed but not running', async () => {
    const { api } = offline({ phase: 'stopped' })
    renderAgents(api)
    expect(
      await screen.findByRole('button', { name: 'Start Herdr' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install Herdr' })).toBe(null)
  })

  it('shows progress while installing and the last failure', async () => {
    const { api } = offline({ phase: 'installing' })
    renderAgents(api)
    expect(
      await screen.findByText('Installing Herdr… this can take a few minutes.'),
    ).toBeTruthy()
    cleanup()
    renderAgents(offline({ phase: 'stopped', error: 'port 8787 in use' }).api)
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'port 8787 in use',
    )
  })

  it('offers no setup on a desktop without the setup route', async () => {
    const { api } = desktopApi(herdrRoutes('/api/herdr', false))
    renderAgents(api)
    expect(
      await screen.findByText('Start herdr on the Mac, then try again.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Herdr$/ })).toBe(null)
  })

  it('starts Herdr and reports a failure from the desktop', async () => {
    const { api, fetch } = desktopApi({
      ...herdrRoutes('/api/herdr', false),
      '/api/herdr/setup': () => reply({ online: false, phase: 'stopped' }),
      '/api/herdr/setup/start': () =>
        reply(
          { online: false, phase: 'stopped', error: 'herdr-core exited 1' },
          502,
        ),
    })
    renderAgents(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Herdr' }))
    expect(await screen.findByText('herdr-core exited 1')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(
      '/api/herdr/setup/start',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
