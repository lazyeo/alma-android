import {
  base64url,
  constantTimeEqual,
  createKeyPair,
  deriveSessionKeys,
  fromBase64url,
  openFrame,
  routingId,
  sealFrame,
} from './crypto'
import { diagnoseRelayFailure } from './relayDiagnosis'

// The relay answers an offline desktop with a failed upgrade, but a desktop
// whose relay link is half-dead can accept the socket and never reply.
export const HANDSHAKE_TIMEOUT_MS = 15_000

export type SessionState = 'init' | 'await-hi' | 'ready' | 'failed' | 'closed'
export interface RelayWebSocket {
  binaryType: string
  readyState: number
  send(data: string | ArrayBuffer | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: string,
    listener: (event: any) => void,
    options?: { once?: boolean },
  ): void
}
export type WebSocketFactory = (url: string) => RelayWebSocket
export interface PairingConfig {
  relayUrl: string
  connectCode: string
  deviceName?: string
}

const asBytes = async (data: unknown): Promise<Uint8Array> => {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof Blob !== 'undefined' && data instanceof Blob)
    return new Uint8Array(await data.arrayBuffer())
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))
    return new Uint8Array(data)
  throw new Error('Unsupported relay frame')
}

export class E2ESession {
  state: SessionState = 'init'
  onFrame?: (frame: any) => void
  onState?: (state: SessionState) => void
  private socket?: RelayWebSocket
  private keys?: Awaited<ReturnType<typeof deriveSessionKeys>>
  private sendCounter = 0n
  private receiveChain = Promise.resolve()
  private sendChain = Promise.resolve()
  private outbox: unknown[] = []
  private connectPromise?: Promise<void>

  constructor(
    private pairing: PairingConfig,
    private webSocketFactory: WebSocketFactory = (url) => new WebSocket(url),
    private diagnose: (probeUrl: string) => Promise<Error> = (url) =>
      diagnoseRelayFailure(url),
  ) {}

  private setState(state: SessionState) {
    this.state = state
    this.onState?.(state)
  }

  async connect(): Promise<void> {
    if (this.state === 'ready') return
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = undefined
    })
    return this.connectPromise
  }

  private async doConnect(): Promise<void> {
    const id = await routingId(this.pairing.connectCode)
    const base = new URL(this.pairing.relayUrl)
    base.protocol = base.protocol === 'http:' ? 'ws:' : 'wss:'
    base.pathname = `/c/${id}/__alma_e2e__`
    const pair = await createKeyPair()
    const nonce = crypto.getRandomValues(new Uint8Array(16))
    const probeUrl = new URL(base)
    probeUrl.protocol = base.protocol === 'ws:' ? 'http:' : 'https:'
    const socket = this.webSocketFactory(base.toString())
    this.socket = socket
    socket.binaryType = 'arraybuffer'
    this.setState('await-hi')
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let opened = false
      let diagnosing = false
      const timer = setTimeout(() => {
        fail(new Error('Desktop did not respond'))
        socket.close()
      }, HANDSHAKE_TIMEOUT_MS)
      const fail = (error: Error) => {
        clearTimeout(timer)
        if (this.state === 'failed' || this.state === 'closed') {
          if (!settled) reject(error)
          settled = true
          return
        }
        settled = true
        this.setState('failed')
        reject(error)
      }
      socket.addEventListener(
        'open',
        () => {
          opened = true
          socket.send(
            JSON.stringify({
              t: 'hi',
              epk: base64url(pair.publicKey),
              n: base64url(nonce),
            }),
          )
        },
        { once: true },
      )
      socket.addEventListener(
        'error',
        () => {
          // A failed upgrade gives no reason; probe the relay to name it.
          if (opened || this.state !== 'await-hi')
            return fail(new Error('Relay connection failed'))
          diagnosing = true
          clearTimeout(timer)
          void this.diagnose(probeUrl.toString())
            .catch(() => new Error('Relay connection failed'))
            .then(fail)
        },
        { once: true },
      )
      socket.addEventListener('close', () => {
        if (diagnosing) return
        // Closing before the responder's hi means the handshake can never finish.
        if (this.state === 'await-hi') fail(new Error('Desktop is offline'))
        else if (this.state !== 'failed') this.setState('closed')
      })
      socket.addEventListener('message', (event) => {
        this.receiveChain = this.receiveChain
          .then(async () => {
            if (this.state === 'await-hi') {
              if (typeof event.data !== 'string')
                throw new Error('Expected text handshake frame')
              const frame = JSON.parse(event.data)
              if (frame.t === 'err')
                throw new Error(frame.message || 'Relay authentication failed')
              if (frame.t !== 'hi')
                throw new Error('Unexpected handshake frame')
              const responderPublic = fromBase64url(frame.epk)
              const responderNonce = fromBase64url(frame.n)
              this.keys = await deriveSessionKeys({
                connectCode: this.pairing.connectCode,
                myPrivateKey: pair.privateKey,
                peerPublic: responderPublic,
                initiatorPublic: pair.publicKey,
                responderPublic,
                initiatorNonce: nonce,
                responderNonce,
              })
              if (
                !constantTimeEqual(
                  fromBase64url(frame.cr),
                  this.keys.confirmResponder,
                )
              ) {
                socket.send(
                  JSON.stringify({ t: 'err', message: 'auth-failed' }),
                )
                throw new Error('Relay authentication failed')
              }
              socket.send(
                JSON.stringify({
                  t: 'ok',
                  ci: base64url(this.keys.confirmInitiator),
                }),
              )
              clearTimeout(timer)
              settled = true
              this.setState('ready')
              for (const queued of this.outbox.splice(0))
                await this.send(queued)
              resolve()
              return
            }
            if (this.state === 'ready' && this.keys)
              this.onFrame?.(
                await openFrame(this.keys.s2c, await asBytes(event.data)),
              )
          })
          .catch(fail)
      })
    })
  }

  send(frame: unknown): Promise<void> {
    if (this.state !== 'ready' || !this.keys || !this.socket) {
      this.outbox.push(frame)
      return this.connect()
    }
    this.sendChain = this.sendChain.then(async () => {
      if (!this.keys || !this.socket) throw new Error('Session unavailable')
      const wire = await sealFrame(this.keys.c2s, this.sendCounter++, frame)
      this.socket.send(wire)
    })
    return this.sendChain
  }

  close() {
    this.setState('closed')
    this.socket?.close()
  }
}
