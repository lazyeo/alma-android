import { describe, expect, it } from 'vitest'
import {
  FOREGROUND_RECONNECT_GRACE_MS,
  foregroundLoadOutcome,
  shouldReloadAfterForeground,
} from './foregroundReload'

describe('foreground reload', () => {
  it('waits for both the tunnel and socket before reloading', () => {
    expect(shouldReloadAfterForeground(true, false)).toBe(false)
    expect(shouldReloadAfterForeground(false, true)).toBe(false)
    expect(shouldReloadAfterForeground(true, true)).toBe(true)
  })

  it('suppresses offline failures inside the reconnect grace window', () => {
    expect(
      foregroundLoadOutcome('offline', 1_000, 0, FOREGROUND_RECONNECT_GRACE_MS),
    ).toBe('suppress')
  })

  it('shows an offline failure after the reconnect grace window', () => {
    expect(
      foregroundLoadOutcome('offline', 9_000, 0, FOREGROUND_RECONNECT_GRACE_MS),
    ).toBe('show')
  })

  it('clears the banner after a successful load', () => {
    expect(foregroundLoadOutcome('success', 1_000, 0)).toBe('clear')
  })
})
