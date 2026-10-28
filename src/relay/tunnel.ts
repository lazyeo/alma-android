import { base64url, fromBase64url } from './crypto'
import {
  E2ESession,
  type PairingConfig,
  type SessionState,
  type WebSocketFactory,
} from './e2eSession'

export type ConnectionState =
  'connecting' | 'connected' | 'reconnecting' | 'offline'
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
  status?: number
  headers?: Record<string, string>
  chunks: Uint8Array[]
  resolve(value: TunnelResponse): void
  reject(error: Error): void
}
interface PendingSocket {
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
  private session?: E2ESession
  private http = new Map<string, PendingHttp>()
  private sockets = new Map<string, PendingSocket>()
  private reconnectAttempt = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private closed = false

  constructor(
    private pairing: PairingConfig,
    private webSocketFactory?: WebSocketFactory,
  ) {}
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
    if (this.session?.state === 'ready') return Promise.resolve()
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
    const session = new E2ESession(this.pairing, this.webSocketFactory)
    this.session = session
    session.onFrame = (frame) => this.handle(frame)
    session.onState = (state: SessionState) => {
      // A superseded session must not drive the current one's lifecycle.
      if (this.session !== session) return
      if (state === 'ready') {
        this.reconnectAttempt = 0
        this.setConnectionState('connected')
      }
      if ((state === 'closed' || state === 'failed') && !this.closed)
        this.scheduleReconnect()
    }
    await session.connect()
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

  private handle(frame: any) {
    if (frame.t?.startsWith('h')) {
      const pending = this.http.get(frame.id)
      if (!pending) return
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
    if (!socket) return
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
    const id = randomId()
    return new Promise<TunnelResponse>((resolve, reject) => {
      const pending: PendingHttp = { chunks: [], resolve, reject }
      this.http.set(id, pending)
      const onAbort = () => {
        this.session?.send({ t: 'hcancel', id })
        this.http.delete(id)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      init.signal?.addEventListener('abort', onAbort, { once: true })
      const body =
        typeof init.body === 'string'
          ? new TextEncoder().encode(init.body)
          : init.body
      this.session
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
        if (this.sockets.has(id))
          return this.session?.send({ t: 'wopen', id, path })
      })
      .catch(reject)
    /**
     * A non-ready E2ESession reconnects itself when sent to, outside this
     * tunnel's backoff; socket frames therefore only go to a ready session.
     */
    const sendReady = (frame: unknown) => {
      if (this.session?.state !== 'ready') return
      void this.session.send(frame).catch(() => undefined)
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
    this.session?.close()
  }
}
