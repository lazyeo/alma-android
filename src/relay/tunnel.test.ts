import { afterEach, describe, expect, it, vi } from 'vitest'
import { RelayTunnel, type TunnelSession } from './tunnel'
import type { TransportLatency } from './latency'
import type { RelayWebSocket, SessionState } from './e2eSession'

afterEach(() => vi.useRealTimers())

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

class FakeSession implements TunnelSession {
  state: SessionState = 'init'
  onFrame?: (frame: any) => void
  onState?: (state: SessionState) => void
  sent: any[] = []
  closed = false

  constructor(
    private onSend?: (frame: any, session: FakeSession) => void,
    private beforeConnect?: () => Promise<void>,
  ) {}

  async connect() {
    await this.beforeConnect?.()
    this.state = 'ready'
    this.onState?.('ready')
  }

  async send(frame: any) {
    this.sent.push(frame)
    this.onSend?.(frame, this)
  }

  close() {
    this.closed = true
    this.state = 'closed'
    this.onState?.('closed')
  }

  emit(frame: any) {
    this.onFrame?.(frame)
  }

  drop() {
    this.state = 'closed'
    this.onState?.('closed')
  }
}

const respond = (session: FakeSession, request: any, body: unknown) => {
  session.emit({ t: 'hres', id: request.id, status: 200, headers: {} })
  session.emit({
    t: 'hchunk',
    id: request.id,
    b: new TextEncoder().encode(JSON.stringify(body)),
  })
  session.emit({ t: 'hend', id: request.id })
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

describe('RelayTunnel latency', () => {
  it('measures hreq to hres RTT on the session that owns the request', async () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(112)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(240)
    const relay = new FakeSession((frame, session) => {
      if (frame.path === '/__alma_lan__') respond(session, frame, null)
      else respond(session, frame, {})
    })
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => false,
      createRelaySession: () => relay,
      now,
      sampledAt: () => 5_000,
    })
    const updates: TransportLatency[] = []
    tunnel.onLatency = (latency) => updates.push(latency)

    await tunnel.connect()
    await tunnel.fetch('/first')
    await tunnel.fetch('/second')

    expect(updates).toEqual([
      { transport: 'relay', ms: 12, sampledAt: 5_000 },
      { transport: 'relay', ms: 26, sampledAt: 5_000 },
    ])
    tunnel.close()
  })

  it('probes the active session every thirty seconds only while visible and connected', async () => {
    vi.useFakeTimers()
    let visible = true
    const listeners = new Map<string, () => void>()
    const relay = new FakeSession((frame, session) => {
      if (frame.path === '/__alma_lan__') respond(session, frame, null)
    })
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => false,
      createRelaySession: () => relay,
      isVisible: () => visible,
      addReprobeListener: (name, listener) => {
        listeners.set(name, listener)
        return () => listeners.delete(name)
      },
      setReprobeInterval: (listener, delay) => {
        expect(delay).toBe(30_000)
        return setInterval(listener, delay)
      },
      clearReprobeInterval: clearInterval,
    })

    await tunnel.connect()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(
      relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
    ).toHaveLength(1)

    visible = false
    listeners.get('visible')?.()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(
      relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
    ).toHaveLength(1)

    visible = true
    listeners.get('visible')?.()
    await vi.waitFor(() =>
      expect(
        relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
      ).toHaveLength(2),
    )

    tunnel.close()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(
      relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
    ).toHaveLength(2)
  })
})

describe('RelayTunnel LAN routing', () => {
  it('shares one probe, keeps response ownership, and falls back transparently', async () => {
    const relay = new FakeSession((frame, session) => {
      if (frame.path === '/__alma_lan__')
        respond(session, frame, { port: 23019, hosts: ['desk.local'] })
      else if (frame.path === '/relay-in-flight')
        queueMicrotask(() => respond(session, frame, { via: 'relay' }))
      else respond(session, frame, { via: 'relay' })
    })
    let direct!: FakeSession
    let releaseDirect!: () => void
    const directGate = new Promise<void>((resolve) => {
      releaseDirect = resolve
    })
    const createDirect = vi.fn(() => {
      direct = new FakeSession(
        (frame, session) => respond(session, frame, { via: 'direct' }),
        () => directGate,
      )
      return direct
    })
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => true,
      createRelaySession: () => relay,
      createDirectSession: createDirect,
    })

    await Promise.all([tunnel.connect(), tunnel.connect()])
    await vi.waitFor(() => expect(createDirect).toHaveBeenCalledTimes(1))
    const relayRequest = tunnel.fetch('/relay-in-flight')
    releaseDirect()
    await vi.waitFor(() => expect(tunnel.activeTransport).toBe('direct'))
    expect(createDirect).toHaveBeenCalledTimes(1)
    await expect(
      relayRequest.then((response) => response.json()),
    ).resolves.toEqual({
      via: 'relay',
    })
    await expect(
      tunnel.fetch('/direct').then((response) => response.json()),
    ).resolves.toEqual({ via: 'direct' })

    direct.drop()
    expect(tunnel.activeTransport).toBe('relay')
    await expect(
      tunnel.fetch('/after-drop').then((response) => response.json()),
    ).resolves.toEqual({ via: 'relay' })
    tunnel.close()
  })

  it('re-probes on online, visible, and timer signals while relay is active', async () => {
    vi.useFakeTimers()
    const listeners = new Map<string, () => void>()
    const relay = new FakeSession((frame, session) => {
      if (frame.path === '/__alma_lan__') respond(session, frame, null)
    })
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => true,
      createRelaySession: () => relay,
      addReprobeListener: (name, listener) => {
        listeners.set(name, listener)
        return () => listeners.delete(name)
      },
      setReprobeInterval: (listener) => setInterval(listener, 3 * 60_000),
      clearReprobeInterval: clearInterval,
    })

    await tunnel.connect()
    await vi.waitFor(() =>
      expect(
        relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
      ).toHaveLength(1),
    )
    listeners.get('online')?.()
    await vi.waitFor(() =>
      expect(
        relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
      ).toHaveLength(2),
    )
    await vi.advanceTimersByTimeAsync(0)
    listeners.get('visible')?.()
    await vi.waitFor(() =>
      expect(
        relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
      ).toHaveLength(3),
    )
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    await vi.waitFor(() =>
      expect(
        relay.sent.filter((frame) => frame.path === '/__alma_lan__'),
      ).toHaveLength(4),
    )
    tunnel.close()
    vi.useRealTimers()
  })
})

describe('RelayTunnel binary payloads', () => {
  it('sends HTTP request bodies as bytes and joins byte response chunks', async () => {
    const relay = new FakeSession((frame, session) => {
      if (frame.path === '/upload') {
        expect(frame.b).toEqual(new Uint8Array([1, 2, 3]))
        session.emit({ t: 'hres', id: frame.id, status: 200, headers: {} })
        session.emit({ t: 'hchunk', id: frame.id, b: new Uint8Array([4, 5]) })
        session.emit({ t: 'hchunk', id: frame.id, b: new Uint8Array([6]) })
        session.emit({ t: 'hend', id: frame.id })
      }
    })
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => false,
      createRelaySession: () => relay,
    })

    const response = await tunnel.fetch('/upload', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
    })

    await expect(response.bytes()).resolves.toEqual(new Uint8Array([4, 5, 6]))
    tunnel.close()
  })

  it('sends and receives WebSocket text and binary payloads unchanged', async () => {
    const relay = new FakeSession()
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => false,
      createRelaySession: () => relay,
    })
    const socket = tunnel.openWebSocket('/ws/test')
    await vi.waitFor(() =>
      expect(relay.sent.some((frame) => frame.t === 'wopen')).toBe(true),
    )
    const open = relay.sent.find((frame) => frame.t === 'wopen')
    relay.emit({ t: 'wopened', id: open.id })
    await socket.opened
    const messages: Array<string | Uint8Array> = []
    socket.onMessage((message) => messages.push(message))

    socket.send('hello')
    socket.send(new Uint8Array([7, 8]))
    expect(relay.sent.slice(-2)).toEqual([
      { t: 'wmsg', id: open.id, s: 'hello' },
      { t: 'wmsg', id: open.id, b: new Uint8Array([7, 8]) },
    ])

    relay.emit({ t: 'wmsg', id: open.id, s: 'world' })
    relay.emit({ t: 'wmsg', id: open.id, b: new Uint8Array([9, 10]) })
    expect(messages).toEqual(['world', new Uint8Array([9, 10])])
    tunnel.close()
  })

  it('notifies close listeners when an opened WebSocket errors', async () => {
    const relay = new FakeSession()
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => false,
      createRelaySession: () => relay,
    })
    const socket = tunnel.openWebSocket('/ws/test')
    await vi.waitFor(() =>
      expect(relay.sent.some((frame) => frame.t === 'wopen')).toBe(true),
    )
    const open = relay.sent.find((frame) => frame.t === 'wopen')
    relay.emit({ t: 'wopened', id: open.id })
    await socket.opened
    const onClose = vi.fn()
    socket.onClose(onClose)

    relay.emit({ t: 'werr', id: open.id, message: 'socket failed' })

    expect(onClose).toHaveBeenCalledTimes(1)
    tunnel.close()
  })
})

describe('RelayTunnel sockets', () => {
  it('fails pending requests and sockets when the relay session drops', async () => {
    // Frames of the replacement session never answer the old ids, so without
    // this a dropped relay left a compact or thread load hanging for good.
    const sessions: FakeSession[] = []
    const tunnel = new RelayTunnel(pairing, undefined, {
      isNative: () => false,
      createRelaySession: () => {
        const session = new FakeSession()
        sessions.push(session)
        return session
      },
    })
    const socket = tunnel.openWebSocket('/ws/threads')
    await vi.waitFor(() =>
      expect(sessions[0]?.sent.some((frame) => frame.t === 'wopen')).toBe(true),
    )
    const relay = sessions[0]
    const open = relay.sent.find((frame) => frame.t === 'wopen')
    relay.emit({ t: 'wopened', id: open.id })
    await socket.opened
    const onClose = vi.fn()
    socket.onClose(onClose)
    const request = tunnel.fetch('/api/threads/t1/compact', { method: 'POST' })
    await vi.waitFor(() =>
      expect(relay.sent.some((frame) => frame.t === 'hreq')).toBe(true),
    )

    relay.drop()

    await expect(request).rejects.toThrow('Relay connection lost')
    expect(onClose).toHaveBeenCalledTimes(1)
    tunnel.close()
  })

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
