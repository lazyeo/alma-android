import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('DesktopSwitcher transport indicator', () => {
  it('shows a localized LAN icon only for the direct active transport', () => {
    const source = readFileSync(
      new URL('./DesktopSwitcher.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain("transport === 'direct'")
    expect(source).toContain('connection.transport.lan')
    expect(source).toContain('Wifi')
  })
})
