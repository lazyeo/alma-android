import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('DesktopSwitcher transport indicator', () => {
  it('shows Wi-Fi for direct and a globe for relay when online', () => {
    const source = readFileSync(
      new URL('./DesktopSwitcher.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain("transport === 'direct'")
    expect(source).toContain('connection.transport.lan')
    expect(source).toContain('Wifi')
    expect(source).toContain('<Globe')
    expect(source).toContain('connection.transport.relay')
    expect(source).toContain('latency.ms !== null')
    expect(source).toContain('isLatencyStale(latency)')
    // The icon alone names the transport; no duplicate text label.
    expect(source).not.toContain('connection.transport.short')
  })
})
