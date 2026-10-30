import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { fromBase64url } from './crypto'
import type { RelayWebSocket, WebSocketFactory } from './e2eSession'

interface LanSocketEvent {
  id: string
  type?: 'text' | 'binary'
  data?: string
  code?: number
  reason?: string
}

interface LanWebSocketPlugin {
  open(options: { url: string }): Promise<{ id: string }>
  send(options: {
    id: string
    type: 'text' | 'binary'
    data: string
  }): Promise<void>
  close(options: { id: string; code?: number; reason?: string }): Promise<void>
  addListener(
    eventName: 'open' | 'message' | 'close' | 'error',
    listener: (event: LanSocketEvent) => void,
  ): Promise<PluginListenerHandle>
}

const NativeLanWebSocket = registerPlugin<LanWebSocketPlugin>('LanWebSocket')

const encodeBase64 = (value: Uint8Array) => {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

class CapacitorLanSocket implements RelayWebSocket {
  binaryType = 'arraybuffer'
  readyState: number = WebSocket.CONNECTING
  private id?: string
  private closed = false
  private listeners = new Map<string, Set<(event: any) => void>>()
  private handles: PluginListenerHandle[] = []

  constructor(url: string) {
    void this.start(url)
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string | ArrayBuffer | Uint8Array) {
    if (!this.id || this.readyState !== WebSocket.OPEN)
      throw new Error('LAN socket is not open')
    const binary =
      typeof data === 'string'
        ? undefined
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(data)
    void NativeLanWebSocket.send({
      id: this.id,
      type: binary ? 'binary' : 'text',
      data: binary ? encodeBase64(binary) : String(data),
    }).catch((error) => this.emit('error', { error }))
  }

  close(code = 1000, reason = '') {
    this.closed = true
    this.readyState = WebSocket.CLOSING
    if (this.id)
      void NativeLanWebSocket.close({ id: this.id, code, reason }).finally(() =>
        this.finishClose(code, reason),
      )
    else this.finishClose(code, reason)
  }

  private async start(url: string) {
    const subscriptions = await Promise.all(
      (['open', 'message', 'close', 'error'] as const).map((name) =>
        NativeLanWebSocket.addListener(name, (event) =>
          this.handle(name, event),
        ),
      ),
    )
    this.handles.push(...subscriptions)
    if (this.closed) return this.cleanup()
    try {
      this.id = (await NativeLanWebSocket.open({ url })).id
    } catch (error) {
      this.emit('error', { error })
      this.finishClose(1006, '')
    }
  }

  private handle(name: string, event: LanSocketEvent) {
    if (!this.id || event.id !== this.id) return
    if (name === 'open') {
      this.readyState = WebSocket.OPEN
      this.emit('open', {})
    } else if (name === 'message') {
      const data =
        event.type === 'binary'
          ? fromBase64url(event.data ?? '')
          : (event.data ?? '')
      this.emit('message', { data })
    } else if (name === 'error') this.emit('error', { message: event.data })
    else this.finishClose(event.code ?? 1000, event.reason ?? '')
  }

  private finishClose(code: number, reason: string) {
    if (this.readyState === WebSocket.CLOSED) return
    this.readyState = WebSocket.CLOSED
    this.emit('close', { code, reason })
    void this.cleanup()
  }

  private emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  private async cleanup() {
    const handles = this.handles.splice(0)
    await Promise.all(handles.map((handle) => handle.remove()))
  }
}

export const nativeLanWebSocketFactory: WebSocketFactory = (url) =>
  new CapacitorLanSocket(url)
