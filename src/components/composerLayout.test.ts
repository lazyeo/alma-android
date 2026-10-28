import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const composerSource = readFileSync(
  new URL('./Composer.tsx', import.meta.url),
  'utf8',
)
const startSource = readFileSync(
  new URL('../screens/StartScreen.tsx', import.meta.url),
  'utf8',
)
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

describe('shared composer layout', () => {
  it('renders the attachment tray above the textarea and outside the toolbar', () => {
    expect(composerSource).toContain('{attachmentTray}')
    expect(composerSource.indexOf('{attachmentTray}')).toBeLessThan(
      composerSource.indexOf('<div className="composer-input">'),
    )
    expect(startSource).toContain('attachmentTray=')
  })

  it('fits composer options without horizontal scrolling', () => {
    expect(composerSource).toContain('className="composer-options"')
    expect(styles).toMatch(/\.composer-options \{[^}]*overflow-x: visible;/s)
    expect(styles).toMatch(/\.composer-chip \{[^}]*flex: 1 1 auto;/s)
    expect(styles).not.toMatch(/\.composer-chip \{[^}]*max-width:/s)
  })

  it('includes the bottom safe area in the composer visual margin', () => {
    expect(styles).not.toMatch(
      /\.composer-shell \{[^}]*padding-bottom: var\(--safe-bottom\);/s,
    )
    expect(styles).toMatch(/\.composer-shell \{[^}]*margin: 8px 10px;/s)
    expect(styles).toMatch(
      /\.composer-shell \{[^}]*margin-bottom: calc\(8px \+ var\(--safe-bottom\)\);/s,
    )
  })

  it('keeps the expand-editor button above the textarea hit target', () => {
    expect(styles).toMatch(/\.expand-editor \{[^}]*z-index: 2;/s)
  })

  it('hides the start-page back button in split layout', () => {
    expect(startSource).toContain("mode === 'single'")
  })

  it('uses a full-width sidebar-colored header in the split sidebar', () => {
    const rule = styles.match(
      /\.split-sidebar \.thread-list-header \{([^}]*)\}/s,
    )?.[1]
    expect(rule).toContain('background: var(--sidebar);')
    expect(rule).toContain('margin-inline: -12px;')
    expect(rule).toContain('padding-inline: 12px;')
    expect(rule).toContain('width: calc(100% + 24px);')
  })
})
