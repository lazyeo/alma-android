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
  decodeInnerFrame,
  deriveSessionKeys,
  encodeInnerFrame,
  fromBase64url,
  openBytes,
  sealBytes,
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
  options: { binary?: boolean } = {},
) {
  const responder = await createKeyPair()
  const responderNonce = crypto.getRandomValues(new Uint8Array(16))
  let confirmInitiator: Uint8Array | undefined
  let c2s: CryptoKey | undefined
  let s2c: CryptoKey | undefined
  let offeredBinary = false
  let verified = false
  const received: unknown[] = []
  vi.mocked(controlled.socket.send).mockImplementation((wire) => {
    if (typeof wire !== 'string') {
      if (!c2s) return
      const bytes = wire instanceof Uint8Array ? wire : new Uint8Array(wire)
      void openBytes(c2s, bytes).then((plaintext) =>
        received.push(decodeInnerFrame(plaintext)),
      )
      return
    }
    const frame = JSON.parse(wire)
    if (frame.t === 'hi') {
      offeredBinary = frame.bin === 1
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
        c2s = keys.c2s
        s2c = keys.s2c
        controlled.emit('message', {
          data: JSON.stringify({
            t: 'hi',
            epk: base64url(responder.publicKey),
            n: base64url(responderNonce),
            cr: base64url(keys.confirmResponder),
            ...(options.binary ? { bin: 1 } : {}),
          }),
        })
      })
    } else if (frame.t === 'ok' && confirmInitiator) {
      verified = constantTimeEqual(fromBase64url(frame.ci), confirmInitiator)
    }
  })
  return {
    verified: () => verified,
    offeredBinary: () => offeredBinary,
    received,
    send: async (frame: Record<string, unknown>, binary: boolean) => {
      if (!s2c) throw new Error('Server is not ready')
      controlled.emit('message', {
        data: await sealBytes(s2c, 0n, encodeInnerFrame(frame, binary)),
      })
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

  it('completes the full direct hi/hi/ok handshake with a fake LAN server', async () => {
    const controlled = controlledSocket()
    const server = await fakeLanProtocolServer(controlled)
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
    await vi.waitFor(() => expect(server.verified()).toBe(true))
    expect(
      vi
        .mocked(controlled.socket.send)
        .mock.calls.filter(([wire]) => typeof wire === 'string')
        .map(([wire]) => JSON.parse(String(wire)).t),
    ).toEqual(['hi', 'ok'])
    session.close()
  })

  it('negotiates binary frames and seals byte payloads in marker form', async () => {
    const controlled = controlledSocket()
    const server = await fakeLanProtocolServer(controlled, { binary: true })
    const session = new E2ESession(pairing, () => controlled.socket)

    const connecting = session.connect()
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    controlled.emit('open')
    await connecting

    expect(server.offeredBinary()).toBe(true)
    expect(session.binaryFrames).toBe(true)
    await session.send({ t: 'hreq', id: 'request', b: new Uint8Array([1, 2]) })
    await vi.waitFor(() => expect(server.received).toHaveLength(1))
    expect(server.received[0]).toEqual({
      t: 'hreq',
      id: 'request',
      b: new Uint8Array([1, 2]),
    })
    session.close()
  })

  it('falls back to v1 JSON when the responder omits bin', async () => {
    const controlled = controlledSocket()
    const server = await fakeLanProtocolServer(controlled)
    const session = new E2ESession(pairing, () => controlled.socket)

    const connecting = session.connect()
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    controlled.emit('open')
    await connecting

    expect(server.offeredBinary()).toBe(true)
    expect(session.binaryFrames).toBe(false)
    await session.send({ t: 'wmsg', id: 'socket', b: new Uint8Array([3, 4]) })
    await vi.waitFor(() => expect(server.received).toHaveLength(1))
    expect(server.received[0]).toEqual({
      t: 'wmsg',
      id: 'socket',
      b: new Uint8Array([3, 4]),
    })
    session.close()
  })

  it('can disable the binary offer and still decodes either incoming form', async () => {
    const controlled = controlledSocket()
    const server = await fakeLanProtocolServer(controlled, { binary: true })
    const session = new E2ESession(
      pairing,
      () => controlled.socket,
      undefined,
      undefined,
      { binaryFrames: false },
    )
    const received: unknown[] = []
    session.onFrame = (frame) => received.push(frame)

    const connecting = session.connect()
    await vi.waitFor(() => expect(session.state).toBe('await-hi'))
    controlled.emit('open')
    await connecting

    expect(server.offeredBinary()).toBe(false)
    expect(session.binaryFrames).toBe(false)
    await server.send({ t: 'wmsg', id: 'one', b: new Uint8Array([5]) }, false)
    await vi.waitFor(() => expect(received).toHaveLength(1))
    await server.send({ t: 'wmsg', id: 'two', b: new Uint8Array([6]) }, true)
    await vi.waitFor(() => expect(received).toHaveLength(2))
    expect(received).toEqual([
      { t: 'wmsg', id: 'one', b: new Uint8Array([5]) },
      { t: 'wmsg', id: 'two', b: new Uint8Array([6]) },
    ])
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
