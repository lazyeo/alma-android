import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const screen = readFileSync(new URL('./HerdrScreens.tsx', import.meta.url), 'utf8')
const terminalView = readFileSync(
  new URL('../terminal/TerminalView.tsx', import.meta.url),
  'utf8',
)

describe('Herdr terminal surface geometry', () => {
  it('uses one two-axis scroller for history and the live grid', () => {
    expect(screen).toContain('className="agent-terminal-content"')
    expect(css).toMatch(
      /\.agent-terminal-scroll-grid\s*{[^}]*overflow:\s*auto;/s,
    )
    expect(css).toMatch(
      /\.agent-terminal-scroll-grid \.agent-terminal-content\s*{[^}]*display:\s*contents;/s,
    )
    expect(css).toMatch(
      /\.agent-terminal-scroll-grid \.agent-terminal-area\s*{[^}]*height:\s*0;[^}]*flex:\s*1 0 auto;/s,
    )
    expect(css).toMatch(
      /\.terminal-viewport\[data-display-mode='grid'\]\s*{[^}]*overflow:\s*hidden;/s,
    )
    expect(terminalView).toMatch(
      /viewport\.style\.width\s*=\s*[\s\S]*?sizing\.contentWidth \+ SURFACE_INSET/,
    )
  })

  it('shares one tokenized surface without an inner border seam', () => {
    expect(screen).toContain("'--agent-terminal-bg': TERMINAL_COLORS.bg")
    expect(css).toMatch(
      /\.agent-terminal-scroll\s*{[^}]*background:\s*var\(--agent-terminal-bg\);/s,
    )
    expect(css).toMatch(
      /\.terminal-viewport,[\s\S]*?border:\s*0;/s,
    )
    expect(css).not.toMatch(
      /\.agent-terminal-history\s*{[^}]*border:\s*var\(--border-hairline\)/s,
    )
  })
})
