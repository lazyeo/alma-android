import { describe, expect, it } from 'vitest'
import { groupTurns, toItemRows, type HerdrMessageRow } from './toMessageParts'

describe('toItemRows', () => {
  it('maps Claude text, reasoning, file tools, and tool errors', () => {
    expect(
      toItemRows([
        { id: 'u1', kind: 'user', text: 'Please inspect it.' },
        { id: 'r1', kind: 'reasoning', text: 'I should read the file.' },
        {
          id: 't1',
          kind: 'tool',
          tool: {
            name: 'Read',
            input: { file_path: '/repo/src/app.ts' },
            result: 'export const app = true',
            done: true,
          },
        },
        {
          id: 't2',
          kind: 'tool',
          tool: {
            name: 'Bash',
            input: { command: 'npm test' },
            result: 'failed',
            is_error: true,
          },
        },
      ]),
    ).toEqual([
      {
        id: 'u1',
        message: {
          role: 'user',
          parts: [{ type: 'text', text: 'Please inspect it.' }],
        },
      },
      {
        id: 'r1',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'I should read the file.',
              state: 'done',
            },
          ],
        },
      },
      {
        id: 't1',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'tool-Read',
              toolName: 'Read',
              input: { file_path: '/repo/src/app.ts' },
              output: 'export const app = true',
              state: 'output-available',
            },
          ],
        },
      },
      {
        id: 't2',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'tool-Bash',
              toolName: 'Bash',
              input: { command: 'npm test' },
              output: 'failed',
              errorText: 'failed',
              state: 'output-error',
            },
          ],
        },
      },
    ])
  })

  it('maps Codex exec commands and strips memory citations', () => {
    expect(
      toItemRows([
        {
          id: 'c1',
          kind: 'assistant',
          text: 'Done.\n\n<oai-mem-citation>private metadata</oai-mem-citation>',
          reasoning: 'Check the build first.',
        },
        {
          id: 'c2',
          kind: 'tool',
          tool: {
            name: 'exec',
            input: {
              input:
                'text(await tools.exec_command({cmd:"npm run check \\"focused\\"",yield_time_ms:1000}));',
            },
            result: 'Script completed',
            done: true,
          },
        },
      ]),
    ).toEqual([
      {
        id: 'c1',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'Check the build first.',
              state: 'done',
            },
            { type: 'text', text: 'Done.' },
          ],
        },
      },
      {
        id: 'c2',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'tool-exec',
              toolName: 'exec',
              input: { command: 'npm run check "focused"' },
              output: 'Script completed',
              state: 'output-available',
            },
          ],
        },
      },
    ])
  })

  it('uses a Herdr tool summary when no structured input exists', () => {
    expect(
      toItemRows([
        {
          id: 'summary',
          kind: 'tool',
          tool: {
            name: 'npm test',
            summary: 'Focused Herdr tests passed',
            done: true,
          },
        },
      ]),
    ).toEqual([
      {
        id: 'summary',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'npm test',
              summary: 'Focused Herdr tests passed',
              input: 'Focused Herdr tests passed',
              output: undefined,
              state: 'output-available',
            },
          ],
        },
      },
    ])
  })

  it('maps Pi text and preserves a generic unknown tool', () => {
    expect(
      toItemRows([
        { id: 'p1', kind: 'agent', text: 'Pi reply' },
        {
          id: 'p2',
          kind: 'mystery-event',
          tool: {
            name: 'custom_lookup',
            summary: 'Lookup a value',
            input: { key: 'alpha' },
            result: { value: 42 },
            done: true,
          },
        },
      ]),
    ).toEqual([
      {
        id: 'p1',
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Pi reply' }],
        },
      },
      {
        id: 'p2',
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'custom_lookup',
              summary: 'Lookup a value',
              input: { key: 'alpha' },
              output: { value: 42 },
              state: 'output-available',
            },
          ],
        },
      },
    ])
  })

  it('keeps request_user_input questions outside shared message parts', () => {
    expect(
      toItemRows([
        {
          id: 'q1',
          kind: 'tool',
          tool: {
            name: 'request_user_input',
            input: {
              questions: [
                {
                  question: 'Ship it?',
                  options: [{ label: 'Yes' }, { label: 'No' }],
                },
              ],
            },
          },
        },
      ]),
    ).toEqual([
      {
        id: 'q1',
        message: { role: 'assistant', parts: [] },
        questions: [
          {
            question: 'Ship it?',
            options: [{ label: 'Yes' }, { label: 'No' }],
          },
        ],
      },
    ])
  })

  describe('groupTurns', () => {
    const row = (
      id: string,
      role: 'user' | 'assistant',
      text: string,
      questions?: HerdrMessageRow['questions'],
    ): HerdrMessageRow => ({
      id,
      message: { role, parts: [{ type: 'text', text }] },
      ...(questions ? { questions } : {}),
    })
    it('merges one assistant turn into a single message', () => {
      const rows = groupTurns([
        row('u1', 'user', 'go'),
        row('a1', 'assistant', 'one'),
        row('a2', 'assistant', 'two'),
        row('u2', 'user', 'next'),
        row('a3', 'assistant', 'three'),
      ])
      expect(rows.map((r) => r.id)).toEqual(['u1', 'a1', 'u2', 'a3'])
      expect(rows[1].message.parts).toEqual([
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
      ])
    })
    it('ends the turn after a question so options stay under it', () => {
      const questions = [
        { title: 'Install?', options: ['Yes', 'No'] },
      ] as unknown as HerdrMessageRow['questions']
      const rows = groupTurns([
        row('a1', 'assistant', 'built'),
        row('q1', 'assistant', 'Install?', questions),
        row('a2', 'assistant', 'later text'),
      ])
      expect(rows.map((r) => r.id)).toEqual(['a1', 'a2'])
      expect(rows[0].questions).toBe(questions)
      expect(rows[0].message.parts).toHaveLength(2)
    })
  })
})
