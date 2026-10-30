import { describe, expect, it } from 'vitest'
import {
  DesktopConnectionManager,
  type ManagedTunnel,
} from './connectionManager'
import type { ActiveTransport, ConnectionState } from './tunnel'
import type { StoredPairing } from './storage'

class FakeTunnel implements ManagedTunnel {
  connectionState: ConnectionState = 'offline'
  activeTransport: ActiveTransport = 'relay'
  onConnectionState?: (state: ConnectionState) => void
  onActiveTransport?: (transport: ActiveTransport) => void
  closed = false
  constructor(private failure?: Error) {}
  async connect() {
    this.connectionState = 'connecting'
    this.onConnectionState?.('connecting')
    if (this.failure) {
      this.connectionState = 'offline'
      this.onConnectionState?.('offline')
      throw this.failure
    }
    this.connectionState = 'connected'
    this.onConnectionState?.('connected')
  }
  close() {
    this.closed = true
  }
  fetch(): never {
    throw new Error('unused')
  }
  openWebSocket(): never {
    throw new Error('unused')
  }
}

const pairing = (id: string): StoredPairing => ({
  id,
  name: id,
  relayUrl: `https://${id}.example`,
  connectCode: `${id}abcdefghijklmnopqrstuvwxyz1234567890`,
  addedAt: 1,
  lastActiveAt: 1,
})

describe('DesktopConnectionManager', () => {
  it('keeps an online desktop usable when another desktop is offline', async () => {
    const tunnels = new Map<string, FakeTunnel>()
    const manager = new DesktopConnectionManager((item) => {
      const tunnel = new FakeTunnel(
        item.id === 'offline' ? new Error('Desktop is offline') : undefined,
      )
      tunnels.set(item.id, tunnel)
      return tunnel
    })

    manager.sync([pairing('online'), pairing('offline')])
    await manager.connectAll()

    expect(manager.get('online')?.status).toBe('online')
    expect(manager.get('offline')?.status).toBe('offline')
    expect(manager.get('online')?.api).toBeDefined()
    expect(tunnels.get('online')?.closed).toBe(false)
  })

  it('publishes the active transport from the managed tunnel', async () => {
    let tunnel!: FakeTunnel
    const manager = new DesktopConnectionManager(() => {
      tunnel = new FakeTunnel()
      return tunnel
    })

    manager.sync([pairing('home')])
    await Promise.resolve()
    expect(manager.get('home')?.transport).toBe('relay')

    tunnel.activeTransport = 'direct'
    tunnel.onActiveTransport?.('direct')
    expect(manager.get('home')?.transport).toBe('direct')
  })

  it('connects newly added desktops and closes removed ones', async () => {
    const tunnels = new Map<string, FakeTunnel>()
    const manager = new DesktopConnectionManager((item) => {
      const tunnel = new FakeTunnel()
      tunnels.set(item.id, tunnel)
      return tunnel
    })
    const updates: number[] = []
    manager.subscribe(() => updates.push(updates.length))

    manager.sync([pairing('home')])
    await Promise.resolve()
    expect(manager.get('home')?.status).toBe('online')

    const homeApi = manager.get('home')?.api
    manager.sync([{ ...pairing('home'), name: 'Renamed' }, pairing('mini')])
    await Promise.resolve()
    expect(manager.get('home')?.api).toBe(homeApi)
    expect(manager.get('home')?.pairing.name).toBe('Renamed')
    expect(manager.get('mini')?.status).toBe('online')

    manager.sync([pairing('mini')])
    expect(tunnels.get('home')?.closed).toBe(true)
    expect(manager.get('home')).toBeUndefined()
    expect(manager.list().map((item) => item.pairing.id)).toEqual(['mini'])
    expect(updates.length).toBeGreaterThan(0)
  })
})
