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
    expect(rule('.remote-screen-heading strong')).toContain(
      'color: var(--foreground)',
    )
    expect(rule('.remote-screen-desktop-switcher')).toContain(
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

  it('does not hardcode gray text colors in control or status selectors', () => {
    for (const selector of [
      '.remote-screen-heading strong',
      '.remote-screen-heading small',
      '.remote-screen-desktop-switcher',
      '.remote-control-indicator',
      '.remote-control-indicator strong',
      '.remote-control-indicator span:last-child',
      '.remote-view-only',
    ])
      expect(rule(selector)).not.toMatch(/color:\s*var\(--gray-/)
  })
})
