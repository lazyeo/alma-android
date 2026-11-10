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
      <AgentsState state={byDesktop.desk} onRetry={() => retry('desk')} />
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
      screen.getByRole('button', { name: 'Studio' }).getAttribute('aria-pressed'),
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
