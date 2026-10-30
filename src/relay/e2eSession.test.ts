import { describe, expect, it, vi } from 'vitest'
import {
  E2ESession,
  type RelayWebSocket,
  type SessionEndpoint,
} from './e2eSession'

const pairing = {
  relayUrl: 'https://relay.example/base',
  connectCode: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
}

function controlledSocket() {
  const listeners = new Map<string, Array<(event: any) => void>>()
  const socket: RelayWebSocket = {
    binaryType: 'blob',
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? []
      current.push(listener)
      listeners.set(type, current)
    },
  }
  return {
    socket,
    emit(type: string, event: any = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
}

describe('E2ESession endpoints', () => {
  it('builds the routed relay endpoint by default', async () => {
    const controlled = controlledSocket()
    const factory = vi.fn((_url: string) => controlled.socket)
    const session = new E2ESession(pairing, factory)

    void session.connect().catch(() => undefined)

    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce())
    const endpoint = new URL(factory.mock.calls[0][0])
    expect(endpoint.protocol).toBe('wss:')
    expect(endpoint.pathname).toMatch(/^\/c\/[A-Za-z0-9_-]+\/__alma_e2e__$/)
    session.close()
  })

  it('uses an explicit direct endpoint without relay diagnostics', async () => {
    vi.useFakeTimers()
    const controlled = controlledSocket()
    const factory = vi.fn((_url: string) => controlled.socket)
    const diagnose = vi.fn()
    const endpoint: SessionEndpoint = {
      url: 'ws://192.168.1.8:23019/__alma_e2e__',
      handshakeTimeoutMs: 1_500,
    }
    const session = new E2ESession(pairing, factory, diagnose, endpoint)

    const connecting = session.connect()
    const rejected = expect(connecting).rejects.toThrow(
      'Desktop did not respond',
    )
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(1_500)

    await rejected
    expect(factory).toHaveBeenCalledWith(endpoint.url)
    expect(diagnose).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not send queued application frames before authentication', async () => {
    const controlled = controlledSocket()
    const session = new E2ESession(
      pairing,
      () => controlled.socket,
      undefined,
      {
        url: 'ws://desktop.local:23019/__alma_e2e__',
        handshakeTimeoutMs: 1_500,
      },
    )

    void session.send({ t: 'hreq', id: 'request-before-ready' })
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    controlled.emit('open')
    await vi.waitFor(() =>
      expect(controlled.socket.send).toHaveBeenCalledTimes(1),
    )

    expect(
      JSON.parse(String(vi.mocked(controlled.socket.send).mock.calls[0][0])),
    ).toMatchObject({
      t: 'hi',
    })
    session.close()
  })
})
