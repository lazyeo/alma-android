import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import { DeltaAccumulator, MAX_STREAMING_OUTPUT_TAIL } from './threadDeltas'

// Shapes below mirror live `/ws/threads` frames: `messageId` is the ROW id
// (`<threadId>--<messageId>`), not the nested `message.id`.
const ROW_ID = 'thread-1--msg-1'

function assistantRow(parts: MessageRow['message']['parts']): MessageRow {
  return {
    id: ROW_ID,
    threadId: 'thread-1',
    message: { id: 'msg-1', role: 'assistant', parts },
    metadata: { versionIndex: 0, versionCount: 1 },
  } as MessageRow
}

const delta = (seq: number, body: Record<string, unknown>) => ({
  messageId: ROW_ID,
  threadId: 'thread-1',
  seq,
  ...body,
})

describe('DeltaAccumulator', () => {
  it('matches deltas by row id and applies text appends', () => {
    const acc = new DeltaAccumulator()
    const rows = [assistantRow([{ type: 'text', text: 'Hel' }])]
    const result = acc.apply(rows, {
      messageId: ROW_ID,
      deltas: [
        delta(1, {
          type: 'text_append',
          partIndex: 0,
          partType: 'text',
          text: 'lo',
        }),
        delta(2, { type: 'text_done', partIndex: 0, partType: 'text' }),
      ],
    })
    expect(result.needsResync).toBe(false)
    expect(result.rows[0].message.parts[0]).toEqual({
      type: 'text',
      text: 'Hello',
      state: 'done',
    })
    expect(rows[0].message.parts[0].text).toBe('Hel')
  })

  it('applies tool part lifecycle deltas the way desktop does', () => {
    const acc = new DeltaAccumulator()
    let rows = [assistantRow([])]
    const apply = (deltas: Record<string, unknown>[]) => {
      const result = acc.apply(rows, { messageId: ROW_ID, deltas })
      rows = result.rows
      return result
    }
    apply([
      delta(1, {
        type: 'part_add',
        part: {
          type: 'tool-Bash',
          toolCallId: 'call-1',
          state: 'input-streaming',
        },
      }),
    ])
    apply([
      delta(2, {
        type: 'tool_input_append',
        partIndex: 0,
        inputKey: 'command',
        text: 'ls ',
      }),
    ])
    apply([
      delta(3, {
        type: 'tool_input_append',
        partIndex: 0,
        inputKey: 'command',
        text: '-la',
      }),
    ])
    apply([
      delta(4, {
        type: 'part_update',
        partIndex: -1,
        toolCallId: 'call-1',
        updates: { state: 'input-available' },
      }),
    ])
    apply([
      delta(0, {
        type: 'tool_output_streaming',
        partIndex: -1,
        toolCallId: 'call-1',
        stream: { stdout: 'a\n' },
      }),
    ])
    apply([
      delta(5, {
        type: 'tool_output_set',
        partIndex: 0,
        state: 'output-error',
        errorText: 'exit 1',
      }),
    ])
    expect(rows[0].message.parts[0]).toMatchObject({
      type: 'tool-Bash',
      input: { command: 'ls -la' },
      state: 'output-error',
      errorText: 'exit 1',
      streamingOutput: { stdout: 'a\n', stderr: '' },
    })
  })

  it('buffers out-of-order deltas until the gap fills and drops duplicates', () => {
    const acc = new DeltaAccumulator()
    let rows = [assistantRow([{ type: 'text', text: '' }])]
    const append = (seq: number, text: string) => {
      rows = acc.apply(rows, {
        messageId: ROW_ID,
        deltas: [
          delta(seq, {
            type: 'text_append',
            partIndex: 0,
            partType: 'text',
            text,
          }),
        ],
      }).rows
    }
    append(1, 'a')
    append(3, 'c')
    expect(rows[0].message.parts[0].text).toBe('a')
    append(2, 'b')
    append(2, 'b')
    expect(rows[0].message.parts[0].text).toBe('abc')
  })

  it('flags a stale base instead of failing the whole batch', () => {
    const acc = new DeltaAccumulator()
    const rows = [assistantRow([{ type: 'text', text: 'x' }])]
    const result = acc.apply(rows, {
      messageId: ROW_ID,
      deltas: [
        delta(1, {
          type: 'text_append',
          partIndex: 3,
          partType: 'reasoning',
          text: 'lost',
        }),
        delta(2, { type: 'part_add', part: { type: 'text', text: 'kept' } }),
      ],
    })
    expect(result.needsResync).toBe(true)
    expect(result.rows[0].message.parts.map((part) => part.text)).toEqual([
      'x',
      'kept',
    ])
  })

  it('requests a resync for a message it has never seen', () => {
    const acc = new DeltaAccumulator()
    const rows = [assistantRow([])]
    const result = acc.apply(rows, {
      messageId: 'thread-1--other',
      deltas: [
        delta(1, { type: 'part_add', part: { type: 'text', text: '' } }),
      ],
    })
    expect(result.needsResync).toBe(true)
    expect(result.rows).toBe(rows)
  })

  it('keeps streamed text when a throttled DB snapshot is behind', () => {
    const acc = new DeltaAccumulator()
    let rows = [assistantRow([{ type: 'text', text: 'Hello' }])]
    rows = acc.apply(rows, {
      messageId: ROW_ID,
      deltas: [
        delta(1, {
          type: 'text_append',
          partIndex: 0,
          partType: 'text',
          text: ' world',
        }),
        delta(2, {
          type: 'part_add',
          part: {
            type: 'tool-Read',
            toolCallId: 't',
            state: 'input-available',
          },
        }),
      ],
    }).rows
    const stale = assistantRow([
      { type: 'text', text: 'Hello' },
      {
        type: 'tool-Read',
        toolCallId: 't',
        state: 'output-available',
        output: 'file',
      },
    ])
    stale.metadata = { versionIndex: 0, versionCount: 2 }
    const merged = acc.sync(rows, [stale])
    expect(merged[0].message.parts[0].text).toBe('Hello world')
    expect(merged[0].message.parts[1]).toMatchObject({
      state: 'output-available',
      output: 'file',
    })
    expect(merged[0].metadata?.versionCount).toBe(2)
  })

  it('takes the snapshot when it is ahead and drops rows no longer active', () => {
    const acc = new DeltaAccumulator()
    const rows = [assistantRow([{ type: 'text', text: 'Hi' }])]
    const fresh = assistantRow([
      { type: 'text', text: 'Hi there' },
      { type: 'text', text: '!' },
    ])
    const other = { ...assistantRow([]), id: 'thread-1--msg-2' }
    expect(acc.sync(rows, [fresh])[0].message.parts).toHaveLength(2)
    expect(acc.sync(rows, [other]).map((row) => row.id)).toEqual([
      'thread-1--msg-2',
    ])
  })

  it('caps streamed tool output to the desktop tail size', () => {
    const acc = new DeltaAccumulator()
    const rows = [assistantRow([{ type: 'tool-Bash', toolCallId: 'c' }])]
    const result = acc.apply(rows, {
      messageId: ROW_ID,
      deltas: [
        delta(0, {
          type: 'tool_output_streaming',
          partIndex: 0,
          toolCallId: 'c',
          stream: { stdout: 'x'.repeat(MAX_STREAMING_OUTPUT_TAIL + 10) },
        }),
      ],
    })
    const output = result.rows[0].message.parts[0].streamingOutput as {
      stdout: string
    }
    expect(output.stdout).toHaveLength(MAX_STREAMING_OUTPUT_TAIL)
  })

  it('keeps untouched parts referentially stable for memoized rendering', () => {
    const acc = new DeltaAccumulator()
    const rows = [
      assistantRow([
        { type: 'reasoning', text: 'old' },
        { type: 'text', text: 'a' },
      ]),
    ]
    const result = acc.apply(rows, {
      messageId: ROW_ID,
      deltas: [
        delta(1, {
          type: 'text_append',
          partIndex: 1,
          partType: 'text',
          text: 'b',
        }),
      ],
    })
    expect(result.rows[0].message.parts[0]).toBe(rows[0].message.parts[0])
    expect(result.rows[0].message.parts[1]).not.toBe(rows[0].message.parts[1])
  })
})
