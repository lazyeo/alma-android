import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import { shellRows, SHELL_STAGGER_MAX } from './AlmaShell'

const row = (
  id: string,
  role: string,
  parts: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) => ({ id, message: { role, parts }, ...extra }) as unknown as MessageRow

const text = (value: string) => ({ type: 'text', text: value })

describe('shellRows', () => {
  it('keeps the last cached messages as plain text paragraphs', () => {
    const rows = [
      row('u1', 'user', [text('hi')]),
      row('a1', 'assistant', [
        text('**Hello**\n\nSecond paragraph'),
        { type: 'tool-Read', toolName: 'Read' },
      ]),
      row('a2', 'assistant', [text('More')]),
    ]
    expect(shellRows(rows)).toEqual([
      { id: 'u1', side: 'user', first: true, paragraphs: ['hi'], stagger: 2 },
      {
        id: 'a1',
        side: 'alma',
        first: true,
        // No Markdown parsing: the source text is shown as is.
        paragraphs: ['**Hello**', 'Second paragraph'],
        stagger: 1,
      },
      {
        id: 'a2',
        side: 'alma',
        first: false,
        paragraphs: ['More'],
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
})
