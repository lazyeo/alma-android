import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import { shellBlocks, shellRows, SHELL_STAGGER_MAX } from './AlmaShell'

const row = (
  id: string,
  role: string,
  parts: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) => ({ id, message: { role, parts }, ...extra }) as unknown as MessageRow

const text = (value: string) => ({ type: 'text', text: value })

describe('shellRows', () => {
  it('keeps the last cached messages as their Markdown blocks', () => {
    const rows = [
      row('u1', 'user', [text('hi')]),
      row('a1', 'assistant', [
        text('**Hello**\n\nSecond paragraph'),
        { type: 'tool-Read', toolName: 'Read' },
      ]),
      row('a2', 'assistant', [text('More')]),
    ]
    expect(shellRows(rows)).toEqual([
      {
        id: 'u1',
        side: 'user',
        first: true,
        blocks: [{ kind: 'p', text: 'hi' }],
        stagger: 2,
      },
      {
        id: 'a1',
        side: 'alma',
        first: true,
        // Inline marks stay in the text; the view draws bold and code.
        blocks: [
          { kind: 'p', text: '**Hello**' },
          { kind: 'p', text: 'Second paragraph' },
        ],
        stagger: 1,
      },
      {
        id: 'a2',
        side: 'alma',
        first: false,
        blocks: [{ kind: 'p', text: 'More' }],
        stagger: 0,
      },
    ])
  })

  it('limits the rows, skips sub-agent and empty rows, and caps the stagger', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, index) =>
        row(`r${index}`, index % 2 ? 'assistant' : 'user', [text(`m${index}`)]),
      ),
      row('nested', 'assistant', [text('inner')], { parentToolCallId: 'x' }),
      row('tools', 'assistant', [{ type: 'tool-Bash', toolName: 'Bash' }]),
    ]
    const result = shellRows(rows, 5)
    expect(result.map((item) => item.id)).toEqual(['r16', 'r17', 'r18', 'r19'])
    expect(result[0].stagger).toBe(SHELL_STAGGER_MAX)
    expect(result.at(-1)!.stagger).toBe(0)
  })

  it('keeps the newest messages whole so the bottom matches the thread', () => {
    const long = 'word '.repeat(300).trim()
    const rows = [
      row('old', 'assistant', [text(long)]),
      ...Array.from({ length: 3 }, (_, index) =>
        row(`new${index}`, 'assistant', [text(long)]),
      ),
    ]
    const [old, ...tail] = shellRows(rows)
    const length = (item: (typeof tail)[number]) =>
      item.blocks[0].kind === 'p' ? item.blocks[0].text.length : 0
    expect(length(old)).toBeLessThanOrEqual(600)
    for (const item of tail) expect(length(item)).toBe(long.length)
  })
})

describe('shellBlocks', () => {
  it('joins soft line breaks into one paragraph like Markdown does', () => {
    expect(shellBlocks('one\ntwo\n\n## Three')).toEqual([
      { kind: 'p', text: 'one two' },
      { kind: 'p', text: 'Three' },
    ])
  })

  it('keeps list items, lazy continuations and list kinds apart', () => {
    expect(
      shellBlocks('Intro:\n- a\n- b\ncontinued\n1. first\n2) second'),
    ).toEqual([
      { kind: 'p', text: 'Intro:' },
      { kind: 'ul', items: ['a', 'b continued'] },
      { kind: 'ol', items: ['first', 'second'] },
    ])
  })

  it('keeps fenced code verbatim with its language, even unclosed', () => {
    expect(
      shellBlocks('Run:\n\n```sh\nnpm test\n  --watch\n```\nDone\n~~~\nopen'),
    ).toEqual([
      { kind: 'p', text: 'Run:' },
      { kind: 'pre', text: 'npm test\n  --watch', language: 'sh' },
      { kind: 'p', text: 'Done' },
      { kind: 'pre', text: 'open', language: undefined },
    ])
  })
})
