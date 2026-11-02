import { describe, expect, it } from 'vitest'
import { detectOpenMenu } from './menuGuard'

const ESC = '\u001b'

describe('detectOpenMenu', () => {
  it('detects the Codex skills picker with ANSI, highlighted row, and footer', () => {
    const screen = `${ESC}[2mAnalytics Dashboard [Skill]  Build analytics dashboards${ESC}[0m
  API Design [Skill]           Design reliable APIs
${ESC}[7m› Browser${ESC}[0m
  Code Review [Skill]          Review code changes
enter insert · esc close`

    expect(detectOpenMenu(screen)).toEqual({ kind: 'cursor-list' })
  })

  it('does not treat the Codex idle placeholder as a menu', () => {
    expect(detectOpenMenu('Ready\n» Ask Codex to do anything')).toBeNull()
  })

  it('does not treat the Claude idle prompt and dim suggestion as a menu', () => {
    expect(
      detectOpenMenu(
        `Previous answer\n❯ ${ESC}[2mTry "fix the tests"${ESC}[0m`,
      ),
    ).toBeNull()
  })

  it('detects a Claude numbered permission menu', () => {
    expect(
      detectOpenMenu(
        `Run this command?\n❯ 1. Yes, run command\n  2. No, cancel`,
      ),
    ).toEqual({ kind: 'numbered' })
  })

  it('ignores transcript bullet lines when an idle prompt is at the bottom', () => {
    expect(
      detectOpenMenu(`Summary\n› first detail\n› second detail\n\n❯ `),
    ).toBeNull()
  })

  it('detects similarly indented list rows around one cursor row', () => {
    expect(
      detectOpenMenu(`Choose a model\n  gpt-5.4\n> gpt-5.3-codex\n  gpt-5.2`),
    ).toEqual({ kind: 'cursor-list' })
  })

  it('detects a menu footer in the visible tail', () => {
    expect(
      detectOpenMenu(
        `Choose an action\n  Continue\n  Cancel\nEsc to cancel · Enter to select`,
      ),
    ).toEqual({ kind: 'cursor-list' })
  })
})
