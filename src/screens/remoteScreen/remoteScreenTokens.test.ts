import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./remoteScreen.css', import.meta.url), 'utf8')

const rule = (selector: string) => {
  const matches = [
    ...css.matchAll(
      new RegExp(
        `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
        'g',
      ),
    ),
  ]
  expect(matches.length, `missing ${selector}`).toBeGreaterThan(0)
  return matches.map((match) => match[1]).join('\n')
}

describe('remote screen theme tokens', () => {
  it('uses semantic text tokens for the status and control bars', () => {
    expect(rule('.remote-screen-header')).toContain(
      'background: var(--background)',
    )
    expect(rule('.remote-screen-desktop-switcher')).toContain(
      'color: var(--foreground)',
    )
    expect(rule('.remote-screen-latency')).toContain(
      'color: var(--muted-foreground)',
    )
    expect(rule('.remote-control-indicator strong')).toContain(
      'color: var(--accent-11)',
    )
    expect(rule('.remote-control-indicator span:last-child')).toContain(
      'color: var(--foreground)',
    )
    expect(rule('.remote-view-only')).toContain(
      'color: var(--muted-foreground)',
    )
  })

  it('sizes the header like the phone root headers, on one line', () => {
    const header = rule('.remote-screen-header')
    expect(header).toContain('height: calc(60px + var(--safe-top))')
    expect(header).not.toContain('min-height')
    expect(header).toContain('white-space: nowrap')
    // The latency drops onto a clipped line rather than squeezing the name.
    const heading = rule('.remote-screen-heading')
    expect(heading).toContain('height: 44px')
    expect(heading).toContain('flex-wrap: wrap')
    expect(heading).toContain('overflow: hidden')
    expect(css).not.toMatch(/\.remote-screen-heading (strong|small)/)
  })

  it('does not hardcode gray text colors in control or status selectors', () => {
    for (const selector of [
      '.remote-screen-desktop-switcher',
      '.remote-screen-latency',
      '.remote-control-indicator',
      '.remote-control-indicator strong',
      '.remote-control-indicator span:last-child',
      '.remote-view-only',
    ])
      expect(rule(selector)).not.toMatch(/color:\s*var\(--gray-/)
  })
})
