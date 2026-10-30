import { base64url, fromBase64url } from './crypto'
import { isAndroidNative } from '../nativeRuntime'
import { lanCandidateUrls, raceLanProbes } from './lanDirect'
import { nativeLanWebSocketFactory } from './nativeLanSocket'
import {
  E2ESession,
  type PairingConfig,
  type SessionState,
  type WebSocketFactory,
} from './e2eSession'

export type ConnectionState =
  'connecting' | 'connected' | 'reconnecting' | 'offline'
export type ActiveTransport = 'relay' | 'direct'
export interface TunnelSession {
  state: SessionState
  onFrame?: (frame: any) => void
  onState?: (state: SessionState) => void
  connect(): Promise<void>
  send(frame: unknown): Promise<void>
  close(): void
}
interface RelayTunnelDependencies {
  isNative?: () => boolean
  createRelaySession?: () => TunnelSession
  createDirectSession?: (url: string) => TunnelSession
  addReprobeListener?: (
    name: 'online' | 'visible',
    listener: () => void,
  ) => () => void
  setReprobeInterval?: (
    listener: () => void,
    delay: number,
  ) => ReturnType<typeof setInterval>
  clearReprobeInterval?: (timer: ReturnType<typeof setInterval>) => void
}
export interface TunnelResponse {
  status: number
  headers: Record<string, string>
  bytes(): Promise<Uint8Array>
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}
export interface TunnelSocket {
  send(data: string | Uint8Array): void
  onMessage(listener: (data: string | Uint8Array) => void): () => void
  onClose(listener: () => void): () => void
  close(): void
  opened: Promise<void>
}
interface PendingHttp {
  session?: TunnelSession
  status?: number
  headers?: Record<string, string>
  chunks: Uint8Array[]
  resolve(value: TunnelResponse): void
  reject(error: Error): void
}
interface PendingSocket {
  session?: TunnelSession
  listeners: Set<(data: string | Uint8Array) => void>
  closeListeners: Set<() => void>
  resolve(): void
  reject(error: Error): void
}

const join = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
const randomId = () => crypto.randomUUID()

export class RelayTunnel {
  connectionState: ConnectionState = 'offline'
  onConnectionState?: (state: ConnectionState) => void
  activeTransport: ActiveTransport = 'relay'
  onActiveTransport?: (transport: ActiveTransport) => void
  private relaySession?: TunnelSession
  private directSession?: TunnelSession
  private probing?: Promise<void>
  private http = new Map<string, PendingHttp>()
  private sockets = new Map<string, PendingSocket>()
  private reconnectAttempt = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reprobeTimer?: ReturnType<typeof setInterval>
  private removeNetworkListeners: Array<() => void> = []
  private closed = false

  constructor(
    private pairing: PairingConfig,
    private webSocketFactory?: WebSocketFactory,
    private dependencies: RelayTunnelDependencies = {},
  ) {
    const reprobe = () => {
      if (this.activeTransport === 'relay') void this.probeLan()
    }
    const addReprobeListener =
      dependencies.addReprobeListener ??
      ((name, listener) => {
        if (typeof window === 'undefined') return () => undefined
        if (name === 'online') {
          window.addEventListener('online', listener)
          return () => window.removeEventListener('online', listener)
        }
        const onVisibility = () => {
          if (document.visibilityState === 'visible') listener()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () =>
          document.removeEventListener('visibilitychange', onVisibility)
      })
    this.removeNetworkListeners.push(
      addReprobeListener('online', reprobe),
      addReprobeListener('visible', reprobe),
    )
    this.reprobeTimer = (dependencies.setReprobeInterval ?? setInterval)(
      reprobe,
      3 * 60_000,
    )
  }
  private setConnectionState(state: ConnectionState) {
    this.connectionState = state
    this.onConnectionState?.(state)
  }

  private connecting?: Promise<void>

  /**
   * Concurrent callers (manager, fetches, sockets, reconnect timer) share one
   * attempt; otherwise each would start a session and orphan the previous one.
   */
  connect(): Promise<void> {
    if (this.relaySession?.state === 'ready') return Promise.resolve()
    if (!this.connecting) {
      this.connecting = this.startSession().finally(() => {
        this.connecting = undefined
      })
    }
    return this.connecting
  }

  private async startSession() {
    // Retries keep whatever scheduleReconnect announced: `reconnecting` right
    // after a live session dropped, `offline` once an attempt has failed.
    if (!this.reconnectAttempt) this.setConnectionState('connecting')
    const session =
      this.dependencies.createRelaySession?.() ??
      new E2ESession(this.pairing, this.webSocketFactory)
    this.relaySession = session
    session.onFrame = (frame) => this.handle(session, frame)
    session.onState = (state: SessionState) => {
      // A superseded session must not drive the current one's lifecycle.
      if (this.relaySession !== session) return
      if (state === 'ready') {
        this.reconnectAttempt = 0
        this.setConnectionState('connected')
        void this.probeLan()
      }
      if ((state === 'closed' || state === 'failed') && !this.closed)
        this.scheduleReconnect()
    }
    await session.connect()
  }

  private setActiveTransport(transport: ActiveTransport) {
    if (this.activeTransport === transport) return
    this.activeTransport = transport
    this.onActiveTransport?.(transport)
  }

  private activeSession() {
    return this.directSession?.state === 'ready'
      ? this.directSession
      : this.relaySession
  }

  private probeLan(): Promise<void> {
    if (
      !(this.dependencies.isNative ?? isAndroidNative)() ||
      this.closed ||
      this.directSession?.state === 'ready'
    )
      return Promise.resolve()
    if (!this.probing)
      this.probing = this.runLanProbe().finally(() => {
        this.probing = undefined
      })
    return this.probing
  }

  private async runLanProbe() {
    try {
      const response = await this.fetchWithSession(
        this.relaySession,
        '/__alma_lan__',
      )
      if (response.status < 200 || response.status >= 300) return
      const urls = lanCandidateUrls(await response.json())
      const winner = await raceLanProbes(
        urls,
        async (url) => {
          const session =
            this.dependencies.createDirectSession?.(url) ??
            new E2ESession(this.pairing, nativeLanWebSocketFactory, undefined, {
              url,
              handshakeTimeoutMs: 1_500,
            })
          session.onFrame = (frame) => this.handle(session, frame)
          session.onState = (state) => {
            if (
              this.directSession === session &&
              (state === 'closed' || state === 'failed')
            ) {
              this.directSession = undefined
              this.setActiveTransport('relay')
            }
          }
          await session.connect()
          return session
        },
        (session) => session.close(),
      )
      if (!winner || this.closed) return winner?.close()
      winner.onState = (state) => {
        if (
          this.directSession === winner &&
          (state === 'closed' || state === 'failed')
        ) {
          this.directSession = undefined
          this.failSessionOperations(
            winner,
            new Error('Direct connection lost'),
          )
          this.setActiveTransport('relay')
        }
      }
      this.directSession?.close()
      this.directSession = winner
      this.setActiveTransport('direct')
    } catch {
      // Direct transport is opportunistic; relay remains the active fallback.
    }
  }

  private failSessionOperations(session: TunnelSession, error: Error) {
    for (const [id, pending] of this.http)
      if (pending.session === session) {
        this.http.delete(id)
        pending.reject(error)
      }
    for (const [id, pending] of this.sockets)
      if (pending.session === session) {
        this.sockets.delete(id)
        pending.reject(error)
        for (const listener of pending.closeListeners) listener()
      }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.closed) return
    this.setConnectionState(
      this.connectionState === 'connected' ? 'reconnecting' : 'offline',
    )
    const delay =
      Math.min(30_000, 500 * 2 ** this.reconnectAttempt++) + Math.random() * 250
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect().catch(() => this.scheduleReconnect())
    }, delay)
  }

  private handle(session: TunnelSession, frame: any) {
    if (frame.t?.startsWith('h')) {
      const pending = this.http.get(frame.id)
      if (!pending || pending.session !== session) return
      if (frame.t === 'hres') {
        pending.status = frame.status
        pending.headers = frame.headers ?? {}
      }
      if (frame.t === 'hchunk') pending.chunks.push(fromBase64url(frame.b))
      if (frame.t === 'herr') {
        this.http.delete(frame.id)
        pending.reject(new Error(frame.message || 'Tunnel request failed'))
      }
      if (frame.t === 'hend') {
        this.http.delete(frame.id)
        const body = join(pending.chunks)
        const text = new TextDecoder().decode(body)
        pending.resolve({
          status: pending.status ?? 0,
          headers: pending.headers ?? {},
          bytes: async () => body.slice(),
          text: async () => text,
          json: async <T>() => JSON.parse(text) as T,
        })
      }
      return
    }
    const socket = this.sockets.get(frame.id)
    if (!socket || socket.session !== session) return
    if (frame.t === 'wopened') socket.resolve()
    if (frame.t === 'werr') {
      socket.reject(new Error(frame.message || 'Tunnel socket failed'))
      this.sockets.delete(frame.id)
    }
    if (frame.t === 'wmsg')
      for (const listener of socket.listeners)
        listener(frame.s ?? fromBase64url(frame.b))
    if (frame.t === 'wclose') {
      for (const listener of socket.closeListeners) listener()
      this.sockets.delete(frame.id)
    }
  }

  async fetch(
    path: string,
    init: {
      method?: string
      headers?: Record<string, string>
      body?: string | Uint8Array
      signal?: AbortSignal
    } = {},
  ): Promise<TunnelResponse> {
    await this.connect()
    return this.fetchWithSession(this.activeSession(), path, init)
  }

  private fetchWithSession(
    session: TunnelSession | undefined,
    path: string,
    init: {
      method?: string
      headers?: Record<string, string>
      body?: string | Uint8Array
      signal?: AbortSignal
    } = {},
  ): Promise<TunnelResponse> {
    const id = randomId()
    return new Promise<TunnelResponse>((resolve, reject) => {
      const pending: PendingHttp = { session, chunks: [], resolve, reject }
      this.http.set(id, pending)
      const onAbort = () => {
        session?.send({ t: 'hcancel', id })
        this.http.delete(id)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      init.signal?.addEventListener('abort', onAbort, { once: true })
      const body =
        typeof init.body === 'string'
          ? new TextEncoder().encode(init.body)
          : init.body
      session
        ?.send({
          t: 'hreq',
          id,
          method: init.method ?? 'GET',
          path,
          headers: init.headers ?? {},
          ...(body ? { b: base64url(body) } : {}),
        })
        .catch(reject)
    })
  }

  openWebSocket(path: string): TunnelSocket {
    const id = randomId()
    let resolve!: () => void, reject!: (error: Error) => void
    const opened = new Promise<void>((r, j) => {
      resolve = r
      reject = j
    })
    const pending: PendingSocket = {
      listeners: new Set(),
      closeListeners: new Set(),
      resolve,
      reject,
    }
    this.sockets.set(id, pending)
    this.connect()
      .then(() => {
        // Closed before the session came up: never open it on the desktop.
        if (this.sockets.has(id)) {
          pending.session = this.activeSession()
          return pending.session?.send({ t: 'wopen', id, path })
        }
      })
      .catch(reject)
    /**
     * A non-ready E2ESession reconnects itself when sent to, outside this
     * tunnel's backoff; socket frames therefore only go to a ready session.
     */
    const sendReady = (frame: unknown) => {
      const session = pending.session
      if (session?.state !== 'ready') return
      void session.send(frame).catch(() => undefined)
    }
    return {
      opened,
      send: (data) =>
        sendReady(
          typeof data === 'string'
            ? { t: 'wmsg', id, s: data }
            : { t: 'wmsg', id, b: base64url(data) },
        ),
      onMessage: (listener) => {
        pending.listeners.add(listener)
        return () => pending.listeners.delete(listener)
      },
      onClose: (listener) => {
        pending.closeListeners.add(listener)
        return () => pending.closeListeners.delete(listener)
      },
      close: () => {
        if (this.sockets.delete(id)) sendReady({ t: 'wclose', id })
      },
    }
  }

  close() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.reprobeTimer)
      (this.dependencies.clearReprobeInterval ?? clearInterval)(
        this.reprobeTimer,
      )
    for (const remove of this.removeNetworkListeners.splice(0)) remove()
    this.directSession?.close()
    this.relaySession?.close()
  }
}
