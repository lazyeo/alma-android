import { describe, expect, it, vi } from 'vitest'
import { RelayTunnel } from './tunnel'
import type { RelayWebSocket } from './e2eSession'

const pairing = {
  relayUrl: 'https://relay.example',
  connectCode: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
}

/** A relay socket that never opens, so the handshake stays in flight. */
function pendingSocket(): RelayWebSocket {
  return {
    binaryType: 'blob',
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
  }
}

describe('RelayTunnel.connect', () => {
  it('reuses an in-flight connect instead of racing a second session', async () => {
    const factory = vi.fn(pendingSocket)
    const tunnel = new RelayTunnel(pairing, factory)

    const first = tunnel.connect()
    const second = tunnel.connect()
    void tunnel.fetch('/api/threads').catch(() => undefined)

    expect(second).toBe(first)
    await vi.waitFor(() => expect(factory).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(factory).toHaveBeenCalledTimes(1)
    tunnel.close()
  })
})

describe('RelayTunnel sockets', () => {
  it('closing a socket after the session dropped does not revive that session', async () => {
    const listeners: Record<string, Array<(event: unknown) => void>> = {}
    const factory = vi.fn((): RelayWebSocket => ({
      binaryType: 'blob',
      readyState: 0,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: (type, listener) => {
        ;(listeners[type] ??= []).push(listener)
      },
    }))
    const tunnel = new RelayTunnel(pairing, factory)
    const socket = tunnel.openWebSocket('/ws/threads')
    socket.opened.catch(() => undefined)
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1))

    for (const type of ['error', 'close'])
      for (const listener of listeners[type] ?? []) listener({})
    await new Promise((resolve) => setTimeout(resolve, 0))
    socket.close()
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Only the tunnel's backoff timer may reconnect, never the dead session.
    expect(factory).toHaveBeenCalledTimes(1)
    tunnel.close()
  })
})
