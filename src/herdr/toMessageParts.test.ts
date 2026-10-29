import { describe, expect, it } from 'vitest'
import { toMessageRows } from './toMessageParts'

describe('toMessageRows', () => {
  it('maps Claude text, reasoning, file tools, and tool errors', () => {
    expect(
      toMessageRows([
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
      toMessageRows([
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
      toMessageRows([
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
      toMessageRows([
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
      toMessageRows([
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
})
