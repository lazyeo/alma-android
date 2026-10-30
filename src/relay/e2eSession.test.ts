import { describe, expect, it, vi } from 'vitest'
import {
  E2ESession,
  type RelayWebSocket,
  type SessionEndpoint,
} from './e2eSession'
import {
  base64url,
  constantTimeEqual,
  createKeyPair,
  deriveSessionKeys,
  fromBase64url,
} from './crypto'

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

async function fakeLanProtocolServer(
  controlled: ReturnType<typeof controlledSocket>,
) {
  const responder = await createKeyPair()
  const responderNonce = crypto.getRandomValues(new Uint8Array(16))
  let confirmInitiator: Uint8Array | undefined
  let verified = false
  vi.mocked(controlled.socket.send).mockImplementation((wire) => {
    if (typeof wire !== 'string') return
    const frame = JSON.parse(wire)
    if (frame.t === 'hi') {
      const initiatorPublic = fromBase64url(frame.epk)
      void deriveSessionKeys({
        connectCode: pairing.connectCode,
        myPrivateKey: responder.privateKey,
        peerPublic: initiatorPublic,
        initiatorPublic,
        responderPublic: responder.publicKey,
        initiatorNonce: fromBase64url(frame.n),
        responderNonce,
      }).then((keys) => {
        confirmInitiator = keys.confirmInitiator
        controlled.emit('message', {
          data: JSON.stringify({
            t: 'hi',
            epk: base64url(responder.publicKey),
            n: base64url(responderNonce),
            cr: base64url(keys.confirmResponder),
          }),
        })
      })
    } else if (frame.t === 'ok' && confirmInitiator) {
      verified = constantTimeEqual(fromBase64url(frame.ci), confirmInitiator)
    }
  })
  return () => verified
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

  it('completes the full direct hi/hi/ok handshake with a fake LAN server', async () => {
    const controlled = controlledSocket()
    const serverVerified = await fakeLanProtocolServer(controlled)
    const session = new E2ESession(
      pairing,
      () => controlled.socket,
      undefined,
      {
        url: 'ws://desktop.local:23019/__alma_e2e__',
        handshakeTimeoutMs: 1_500,
      },
    )

    const connecting = session.connect()
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    controlled.emit('open')

    await connecting
    expect(session.state).toBe('ready')
    await vi.waitFor(() => expect(serverVerified()).toBe(true))
    expect(
      vi
        .mocked(controlled.socket.send)
        .mock.calls.filter(([wire]) => typeof wire === 'string')
        .map(([wire]) => JSON.parse(String(wire)).t),
    ).toEqual(['hi', 'ok'])
    session.close()
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
