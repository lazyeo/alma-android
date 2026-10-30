import { afterEach, describe, expect, it, vi } from 'vitest'
import { RelayTunnel, type TunnelSession } from './tunnel'
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
    b: Buffer.from(JSON.stringify(body)).toString('base64url'),
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
