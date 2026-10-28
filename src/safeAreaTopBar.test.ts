import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const settings = readFileSync(
  new URL('./screens/SettingsScreen.tsx', import.meta.url),
  'utf8',
)
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function rule(selector: string) {
  return styles.match(new RegExp(`${selector} \\{([^}]*)\\}`, 's'))?.[1] ?? ''
}

describe('edge-to-edge top bar', () => {
  it('removes the fullscreen preference and legacy mode selectors', () => {
    expect(settings).not.toContain('Full-screen (draw under system bars)')
    expect(styles).not.toContain('.fullscreen-system-bars')
    expect(styles).not.toContain('native-platform:not(')
    expect(html).toContain(
      "localStorage.removeItem('alma-mobile.fullscreen.v1')",
    )
  })

  it('aligns split column headers to safe-top plus 60px without dividers', () => {
    expect(rule('\\.split-rail')).toContain(
      'padding: var(--safe-top) 0 calc(12px + var(--safe-bottom))',
    )
    expect(styles).toMatch(
      /\.thread-list-header \{[^}]*height: calc\(60px \+ var\(--safe-top\)\);/s,
    )
    expect(styles).toMatch(
      /\.detail-header \{[^}]*height: calc\(60px \+ var\(--safe-top\)\);/s,
    )
    expect(styles).not.toContain('.split-rail::after')
    expect(styles).not.toContain('.split-sidebar::after')
  })

  it('has no scroll-edge or full-width tab divider', () => {
    expect(styles).not.toContain('.scroll-edge')
    expect(rule('\\.thread-tabs')).not.toContain('border-bottom')
  })
})
