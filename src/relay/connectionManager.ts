import { AlmaApi } from './almaApi'
import { RelayTunnel, type ConnectionState } from './tunnel'
import type { StoredPairing } from './storage'

export type DesktopStatus = 'connecting' | 'online' | 'offline' | 'error'

export interface ManagedTunnel {
  connectionState: ConnectionState
  onConnectionState?: (state: ConnectionState) => void
  connect(): Promise<void>
  close(): void
  fetch: RelayTunnel['fetch']
  openWebSocket: RelayTunnel['openWebSocket']
}

export interface DesktopConnection {
  pairing: StoredPairing
  tunnel: ManagedTunnel
  api: AlmaApi
  status: DesktopStatus
  error?: string
}

function desktopStatus(state: ConnectionState): DesktopStatus {
  if (state === 'connected') return 'online'
  if (state === 'connecting' || state === 'reconnecting') return 'connecting'
  return 'offline'
}

export class DesktopConnectionManager {
  private connections = new Map<string, DesktopConnection>()
  private listeners = new Set<() => void>()

  constructor(
    private createTunnel: (pairing: StoredPairing) => ManagedTunnel = (
      pairing,
    ) => new RelayTunnel(pairing),
  ) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }

  /** Reconciles tunnels with storage; only new or re-keyed desktops connect. */
  sync(pairings: StoredPairing[]) {
    const added: DesktopConnection[] = []
    const ids = new Set(pairings.map((item) => item.id))
    for (const [id, connection] of this.connections) {
      if (!ids.has(id)) {
        connection.tunnel.close()
        this.connections.delete(id)
      }
    }
    for (const pairing of pairings) {
      const current = this.connections.get(pairing.id)
      if (
        current &&
        current.pairing.connectCode === pairing.connectCode &&
        current.pairing.relayUrl === pairing.relayUrl
      ) {
        current.pairing = pairing
        continue
      }
      current?.tunnel.close()
      const tunnel = this.createTunnel(pairing)
      const connection: DesktopConnection = {
        pairing,
        tunnel,
        api: new AlmaApi(tunnel),
        status: desktopStatus(tunnel.connectionState),
      }
      tunnel.onConnectionState = (state) => {
        connection.status = desktopStatus(state)
        if (connection.status !== 'offline') connection.error = undefined
        this.emit()
      }
      this.connections.set(pairing.id, connection)
      added.push(connection)
    }
    this.emit()
    for (const connection of added) void this.connectOne(connection)
  }

  async connectAll() {
    await Promise.all(this.list().map((item) => this.connectOne(item)))
  }

  private async connectOne(connection: DesktopConnection) {
    try {
      await connection.tunnel.connect()
    } catch (error) {
      // A closed/replaced tunnel must not overwrite its successor's status.
      if (this.connections.get(connection.pairing.id) !== connection) return
      connection.status = 'offline'
      connection.error =
        error instanceof Error ? error.message : 'Desktop is offline'
      this.emit()
    }
  }

  get(id: string) {
    return this.connections.get(id)
  }

  list() {
    return [...this.connections.values()]
  }

  close() {
    for (const connection of this.connections.values())
      connection.tunnel.close()
    this.connections.clear()
    this.emit()
  }
}
