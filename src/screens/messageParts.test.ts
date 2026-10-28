import { describe, expect, it } from 'vitest'
import {
  buildMessageParts,
  messageText,
  taskToolResult,
  toolOutputText,
} from './messageParts'

describe('message parts', () => {
  it('builds text, image, and uploaded file parts', () => {
    expect(
      buildMessageParts('  Describe these  ', [
        {
          kind: 'image',
          name: 'photo.jpg',
          mediaType: 'image/jpeg',
          url: 'http://localhost/photo.jpg',
        },
        {
          kind: 'file',
          name: 'notes.txt',
          mediaType: 'text/plain',
          filePath: '/cache/notes.txt',
        },
      ]),
    ).toEqual([
      { type: 'text', text: 'Describe these' },
      {
        type: 'file',
        mediaType: 'image/jpeg',
        url: 'http://localhost/photo.jpg',
        filename: 'photo.jpg',
      },
      { type: 'text', text: '/cache/notes.txt' },
    ])
  })

  it('extracts editable and copyable text only', () => {
    expect(
      messageText([
        { type: 'text', text: 'one' },
        { type: 'file', url: 'x' },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('one\n\ntwo')
  })

  it('renders tool output for running, failed, and structured tool parts', () => {
    // Desktop leaves `output` unset while a tool runs (input-available) and
    // stores failures in `errorText` (output-error). Both crashed the thread view.
    expect(
      toolOutputText({ type: 'tool-Bash', state: 'input-available' }),
    ).toBe('')
    expect(
      toolOutputText({
        type: 'tool-Bash',
        state: 'output-error',
        errorText: 'boom',
      }),
    ).toBe('boom')
    expect(toolOutputText({ type: 'tool-Read', output: 'plain' })).toBe('plain')
    expect(
      toolOutputText({
        type: 'tool-Bash',
        state: 'input-available',
        streamingOutput: { stdout: 'line', stderr: 'warn' },
      }),
    ).toBe('line\nwarn')
    expect(toolOutputText({ type: 'tool-Task', output: { ok: true } })).toBe(
      '{\n  "ok": true\n}',
    )
  })
})

describe('Task tool output', () => {
  const task = (output: unknown, type = 'tool-Task') => ({
    type,
    toolCallId: 'call-1',
    state: 'output-available',
    output,
  })

  it('reads the {taskId, status, result} object as markdown with its status', () => {
    expect(
      taskToolResult(
        'Task',
        task({ taskId: 't1', status: 'completed', result: '## Done' }),
      ),
    ).toEqual({ result: '## Done', status: 'Completed', failed: false })
    expect(
      taskToolResult(
        'Task',
        task({ taskId: 't1', status: 'failed', result: 'Exit code: 1' }),
      ),
    ).toEqual({ result: 'Exit code: 1', status: 'Failed', failed: true })
    expect(
      taskToolResult(
        'Task',
        task({ taskId: 't1', status: 'timed_out', result: '' }),
      ),
    ).toEqual({ result: '', status: 'Timed out', failed: true })
  })

  it('keeps the normal output for other tools and unexpected shapes', () => {
    const output = { taskId: 't1', status: 'completed', result: 'x' }
    expect(taskToolResult('Bash', task(output, 'tool-Bash'))).toBeUndefined()
    expect(taskToolResult('Task', task('plain text'))).toBeUndefined()
    expect(
      taskToolResult('Task', task({ status: 'completed' })),
    ).toBeUndefined()
  })
})
