import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const composer = read('../components/Composer.tsx')
const attachments = read('../components/ComposerAttachments.tsx')
const goal = read('../components/ComposerGoal.tsx')
const activity = read('./GenerationActivityBar.tsx')
const queuePanel = read('./QueuePanel.tsx')
const thread = read('./ThreadScreen.tsx')
const start = read('./StartScreen.tsx')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')

describe('composer controls', () => {
  it('keeps goal and loop in the add sheet instead of the toolbar', () => {
    expect(composer).not.toContain('goalControl')
    expect(attachments).toContain('goalControl?: ReactNode')
    expect(attachments).toContain('{goalControl}')
    expect(goal).toContain("variant: 'strip' | 'sheet-row'")
    expect(thread).toContain('goalControl={')
    expect(thread).toContain('variant="sheet-row"')
    expect(start).toContain('goalControl={')
    expect(start).toContain('variant="sheet-row"')
  })

  it('uses a plain plus and non-scrolling option row at phone width', () => {
    expect(styles).toMatch(
      /\.composer \.attach \{[^}]*background: transparent;/s,
    )
    expect(styles).toMatch(/\.composer-options \{[^}]*overflow-x: visible;/s)
    expect(styles).toMatch(/\.composer-chip \{[^}]*flex: 1 1 auto;/s)
  })

  it('keeps stop only in the generation activity bar', () => {
    expect(composer).not.toContain('onStop')
    expect(composer).not.toContain('className="stop"')
    expect(activity).toContain('<HoldToStopButton')
    expect(thread).toContain('onStop={sendQueueNow}')
    expect(queuePanel).toContain('className="queue-send-now"')
    expect(queuePanel).toContain('onSendNow()')
    expect(thread).toContain('onSendNow={sendQueueNow}')
  })
})

describe('latest-message and split headers', () => {
  it('uses one standalone ArrowDownToLine jump for idle and generating states', () => {
    expect(activity).not.toContain('ArrowDownToLine')
    expect(thread).toContain('className="latest-jump"')
    expect(thread).toContain("aria-label={t('thread.jumpToLatest')}")
  })

  it('does not add a collapsed-sidebar toggle to the thread header', () => {
    expect(thread).not.toContain('aria-label="Show thread list"')
    expect(thread).not.toContain('<PanelLeft')
  })

  it('defines all requested composer screenshot scenarios', () => {
    for (const file of [
      'composer-controls-generating-scrolled.png',
      'composer-controls-idle-scrolled.png',
      'composer-controls-add-sheet.png',
      'composer-controls-start-composer.png',
      'composer-controls-two-pane-collapsed.png',
    ])
      expect(capture).toContain(`'${file}'`)
  })
})
