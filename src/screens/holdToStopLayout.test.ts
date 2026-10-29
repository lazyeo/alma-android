import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const holdButton = read('./HoldToStopButton.tsx')
const thread = read('./ThreadScreen.tsx')
const start = read('./StartScreen.tsx')
const composer = read('../components/Composer.tsx')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')

describe('hold-to-stop feedback', () => {
  it('renders the hint in a body portal with toast-level stacking', () => {
    expect(holdButton).toContain('createPortal')
    expect(holdButton).toContain('document.body')
    expect(styles).toMatch(/--z-toast: 60;/)
    expect(styles).toMatch(
      /\.stop-hold-hint \{[^}]*position: fixed;[^}]*z-index: var\(--z-toast\);/s,
    )
    expect(styles).toMatch(
      /\.stop-hold-hint \{[^}]*font-size: var\(--text-sm\);/s,
    )
  })

  it('uses a thicker real-circumference ring that fits its viewBox', () => {
    expect(holdButton).toContain('const RING_RADIUS = 16')
    expect(holdButton).toContain(
      'const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS',
    )
    expect(holdButton).not.toMatch(/<circle[^>]*pathLength=/s)
    expect(styles).toMatch(
      /\.stop-hold-track,[\s\S]*?\.stop-hold-progress \{[^}]*stroke-width: 4;/,
    )
  })
})

describe('queue drag containment', () => {
  it('reserves inline scroll padding and disables the edge fade during drag', () => {
    expect(styles).toMatch(
      /\.queue-scroll \{[^}]*padding-inline: var\(--queue-drag-shadow-gutter\);/s,
    )
    expect(styles).toMatch(
      /\.queue-scroll\.overflowing:has\(\.queue-item\.dragging\) \{[^}]*mask-image: none;[^}]*-webkit-mask-image: none;/s,
    )
  })
})

describe('shared composer spacing', () => {
  it('uses the same Composer component for thread and start screens', () => {
    expect(thread).toContain('<Composer')
    expect(start).toContain('<Composer')
    expect(composer).toContain('className={`composer')
  })

  it('defines one shared set of composer spacing variables without a start override', () => {
    expect(styles).toMatch(/--composer-pad-x: 9px;/)
    expect(styles).toMatch(/--composer-pad-bottom: 8px;/)
    expect(styles).toMatch(/--composer-toolbar-gap: 4px;/)
    expect(styles).toMatch(
      /\.composer \{[^}]*padding: 10px var\(--composer-pad-x\) var\(--composer-pad-bottom\);[^}]*gap: var\(--composer-toolbar-gap\);/s,
    )
    expect(styles).not.toMatch(
      /\.split-start-composer \.composer \{[^}]*padding:/s,
    )
  })

  it('captures and measures supported hold-to-stop states across layouts', () => {
    for (const file of [
      'hold-to-stop-stop-hint-phone.png',
      'hold-to-stop-stop-ring-phone.png',
      'hold-to-stop-stop-hint-two-pane.png',
      'hold-to-stop-queue-mid-drag.png',
      'hold-to-stop-composer-thread-phone.png',
      'hold-to-stop-composer-start-phone.png',
      'hold-to-stop-composer-thread-two-pane.png',
      'hold-to-stop-composer-start-two-pane.png',
    ])
      expect(capture).toContain(`'${file}'`)
    expect(capture).toContain('assertComposerSpacing')
    expect(capture).toContain('assertQueueDragShadowContained')
    expect(capture).toContain('assertStopHintPlacement')
  })
})
