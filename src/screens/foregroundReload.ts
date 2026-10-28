import type { RelayErrorPresentation } from './relayError'

export const FOREGROUND_RECONNECT_GRACE_MS = 8_000

export const shouldReloadAfterForeground = (
  linkOnline: boolean,
  socketReady: boolean,
) => linkOnline && socketReady

type LoadKind = RelayErrorPresentation['kind'] | 'success'

export function foregroundLoadOutcome(
  kind: LoadKind,
  now: number,
  foregroundedAt?: number,
  graceMs = FOREGROUND_RECONNECT_GRACE_MS,
): 'clear' | 'suppress' | 'show' {
  if (kind === 'success') return 'clear'
  const reconnectFailure = kind === 'offline' || kind === 'timeout'
  if (
    reconnectFailure &&
    foregroundedAt !== undefined &&
    now - foregroundedAt < graceMs
  )
    return 'suppress'
  return 'show'
}
