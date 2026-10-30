import { createContext, useContext } from 'react'
import type {
  AlmaApi,
  ActiveTransport,
  DesktopStatus,
  ManagedTunnel,
  PairingStore,
  StoredPairing,
} from '../relay'

/** The desktop a scoped route (`/d/:desktopId/...`) is bound to. */
export interface ConnectionValue {
  pairing: StoredPairing
  tunnel: ManagedTunnel
  api: AlmaApi
  status: DesktopStatus
  transport: ActiveTransport
  error?: string
}

export interface DesktopSummary {
  pairing: StoredPairing
  /** Absent until the connection manager has synced this pairing. */
  connection?: ConnectionValue
  status: DesktopStatus
  transport: ActiveTransport
}

export interface DesktopsValue {
  store: PairingStore
  desktops: DesktopSummary[]
  activate(id: string): void
  rename(id: string, name: string): void
  setHidden(id: string, hidden: boolean): void
  remove(id: string): void
}

export const ConnectionContext = createContext<ConnectionValue | null>(null)
export const DesktopsContext = createContext<DesktopsValue | null>(null)

export const useConnection = () => {
  const value = useContext(ConnectionContext)
  // Developer invariant, never shown: screens render only once paired.
  if (!value) throw new Error('useConnection requires a paired desktop')
  return value
}

export const useDesktops = () => {
  const value = useContext(DesktopsContext)
  if (!value) throw new Error('useDesktops requires DesktopsContext')
  return value
}
