import { afterEach, describe, expect, it, vi } from 'vitest'
import { E2ESession, HANDSHAKE_TIMEOUT_MS } from './e2eSession'
import type { RelayWebSocket } from './e2eSession'
import { RelayTunnel } from './tunnel'

const pairing = {
  relayUrl: 'https://relay.example',
  connectCode: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
}

type Listener = (event: unknown) => void
/** Fake relay socket whose events the test fires by hand. */
function scriptedSocket() {
  const listeners = new Map<string, Listener[]>()
  const socket: RelayWebSocket & { fire(type: string): void } = {
    binaryType: 'blob',
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener({})
    },
  }
  return socket
}

afterEach(() => vi.useRealTimers())

describe('offline desktop detection', () => {
  it('rejects the handshake when the relay closes without an error event', async () => {
    const socket = scriptedSocket()
    const session = new E2ESession(pairing, () => socket)
    const connected = session.connect()
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    socket.fire('close')
    await expect(connected).rejects.toThrow(/offline/i)
    expect(session.state).toBe('failed')
  })

  it('times out a handshake the desktop never answers', async () => {
    vi.useFakeTimers()
    const socket = scriptedSocket()
    const session = new E2ESession(pairing, () => socket)
    const connected = session.connect()
    const outcome = connected.catch((error: Error) => error)
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    socket.fire('open')
    await vi.advanceTimersByTimeAsync(HANDSHAKE_TIMEOUT_MS + 1)
    expect(String(await outcome)).toMatch(/did not respond/i)
    expect(socket.close).toHaveBeenCalled()
  })

  it('reports offline, not reconnecting, while retrying a desktop that never answered', async () => {
    const states: string[] = []
    const sockets: ReturnType<typeof scriptedSocket>[] = []
    const tunnel = new RelayTunnel(pairing, () => {
      const socket = scriptedSocket()
      sockets.push(socket)
      return socket
    })
    tunnel.onConnectionState = (state) => states.push(state)
    const first = tunnel.connect().catch(() => undefined)
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].fire('error')
    await first
    expect(tunnel.connectionState).toBe('offline')
    expect(states).not.toContain('reconnecting')
    tunnel.close()
  })
})
