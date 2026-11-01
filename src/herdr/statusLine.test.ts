import { describe, expect, it } from 'vitest'
import { agentStatusLine } from './statusLine'

describe('agentStatusLine', () => {
  it.each([
    [
      '✻ Thinking… (12s · ↓ 1.2k tokens · esc to interrupt)',
      { text: 'Thinking', elapsedMs: 12_000, live: true },
    ],
    [
      '⠋ Running tool… (3s)',
      { text: 'Running tool', elapsedMs: 3_000, live: true },
    ],
    [
      '  ✶ Reading files (1m 2s · esc to interrupt)  ',
      { text: 'Reading files', elapsedMs: 62_000, live: true },
    ],
    [
      '\u001b[2m✻ Writing tests… (2m 7s · ↓ 400 tokens)\u001b[0m',
      { text: 'Writing tests', elapsedMs: 127_000, live: true },
    ],
  ])('parses a live status line', (line, expected) => {
    expect(agentStatusLine(`older output\n${line}\n`)).toEqual(expected)
  })

  it('returns no live status for ordinary terminal text', () => {
    expect(agentStatusLine('npm test\nAll tests passed')).toEqual({
      text: '',
      live: false,
    })
  })
})
