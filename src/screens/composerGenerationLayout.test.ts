import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const thread = read('./ThreadScreen.tsx')
const composer = read('../components/Composer.tsx')
const composerGoal = read('../components/ComposerGoal.tsx')
const goalHook = read('./useComposerGoal.ts')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')

/** Body of the last rule for an exact selector list (later rules win). */
const lastRule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [
    ...styles.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, 'g')),
  ]
  return matches.at(-1)?.[1] ?? ''
}

describe('generation activity bar', () => {
  it('sits between the message list and the composer card', () => {
    const bar = thread.indexOf('<GenerationActivityBar')
    expect(bar).toBeGreaterThan(thread.indexOf('className="message-area"'))
    expect(bar).toBeLessThan(
      thread.indexOf('<footer\n            className={`composer-shell'),
    )
  })

  it('uses a static orb and no shimmer under reduced motion', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.activity-bar-phase[^}]*animation: none;/s,
    )
  })
})

describe('tool and reasoning press areas', () => {
  for (const selector of [
    '.tool-card .tool-summary',
    '.reasoning summary',
    '.tool-group summary',
  ]) {
    it(`pads ${selector} with a negative-margin rounded press area`, () => {
      const rule = lastRule(selector)
      expect(rule).toContain('margin-inline: -8px;')
      expect(rule).toContain('padding-inline: 8px;')
      expect(rule).toContain('border-radius: var(--radius-md);')
      expect(lastRule(`${selector}:active`)).toContain(
        'background: var(--muted);',
      )
    })
  }
})

describe('expanded composer', () => {
  it('reuses the shared Composer instead of a plain textarea', () => {
    const dialog = thread.slice(thread.indexOf('className={`fullscreen-editor'))
    const end = dialog.indexOf('</div>\n        ) : null}')
    const body = dialog.slice(0, end)
    expect(body).toContain('{composerView}')
    expect(body).not.toContain('<textarea')
    expect(body).not.toContain('<h2>')
    expect(body).toContain("aria-label={t('thread.editor.minimize')}")
    expect(body).toContain('<Minimize2')
  })

  it('collapses the editor only after a direct send or queued send is accepted', () => {
    const send = thread.slice(thread.indexOf('async function send()'))
    const body = send.slice(0, send.indexOf('\n  }\n'))
    expect(body).toContain('queueCurrentMessage()')
    expect(body).toContain('closeEditorAfterAcceptedSend(')
    expect(body).toContain('editorOverlay.requestClose')
    expect(body).not.toContain('setEditorOpen(false)')
  })

  it('lets the expanded composer textarea fill the screen', () => {
    expect(composer).toContain("expanded ? ' expanded' : ''")
    expect(lastRule('.fullscreen-editor .composer textarea')).toContain(
      'max-height: none;',
    )
  })
})

describe('icon buttons', () => {
  it('draws composer icon buttons at exactly 28px', () => {
    const rule = lastRule(
      '.composer .send,\n.composer .stop,\n.composer .attach,\n.expand-editor',
    )
    expect(rule).toContain('width: 28px;')
    expect(rule).toContain('height: 28px;')
    expect(thread).not.toMatch(/<Maximize2 size=\{18\}/)
  })

  it('shrinks filled discs to an optical 26px and rings pressed toggles', () => {
    const filled = lastRule('.composer .send,\n.composer .stop')
    expect(filled).toContain('padding: 1px;')
    expect(filled).toContain('background-clip: content-box;')
    expect(lastRule(".composer-goal-button[aria-pressed='true']")).toContain(
      'outline: var(--border-hairline) solid var(--accent-8)',
    )
  })

  it('keeps composer glyphs at 16px with stroke 2', () => {
    expect(thread).toContain(
      'const COMPOSER_ICON = { size: 16, strokeWidth: 2 } as const',
    )
    expect(composer).toContain(
      'const ICON = { size: 16, strokeWidth: 2 } as const',
    )
  })
})

describe('goal and loop sheet', () => {
  it('offers both desktop goal and loop creation paths in one sheet', () => {
    expect(composerGoal).toContain("t('composer.goalLoop.untilTitle')")
    expect(composerGoal).toContain("t('composer.loop.scheduleTitle')")
    expect(composerGoal).toContain("t('composer.loop.promptExample')")
    expect(composerGoal).toContain("t('composer.loop.scheduleNote')")
  })

  it('shows active goal and loop strips with their management actions', () => {
    expect(composerGoal).toContain('composer-loop-strip')
    expect(composerGoal).toContain('state.onStopLoop')
    expect(goalHook).toContain('api.getLoop(threadId)')
    expect(goalHook).toContain('api.setLoop(threadId')
  })
})

describe('composer and generation captures', () => {
  it('captures the requested states at phone and tablet sizes', () => {
    for (const file of [
      'composer-activity-bar-phone.png',
      'composer-activity-bar-latest-phone.png',
      'composer-activity-bar-tablet.png',
      'composer-press-areas-phone.png',
      'composer-goal-loop-sheet-phone.png',
      'composer-goal-loop-sheet-tablet.png',
      'composer-goal-loop-strips-phone.png',
      'composer-expanded-composer-phone.png',
      'composer-editor-origin-phone.png',
      'composer-editor-mid-expand-phone.png',
      'composer-editor-expanded-phone.png',
      'composer-expanded-composer-tablet.png',
      'composer-icon-buttons-phone.png',
    ])
      expect(capture).toContain(`'${file}'`)
    expect(capture).toContain('async function reportBoundingSizes(')
  })
})
