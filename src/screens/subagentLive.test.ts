import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import {
  SubagentRuns,
  isSubagentMessageId,
  latestSubagentActivity,
  nestedRowsByParent,
  subagentEventContext,
} from './subagentLive'

// Shapes mirror Desktop's `handleSubagentStreamEvent` broadcasts: the thread
// id lives in `data.context.threadId`, never in `data.threadId`.
const context = {
  taskId: 'task-1',
  threadId: 'thread-1',
  parentMessageId: 'msg-1',
  parentToolCallId: 'call-task',
  subagentMessageId: 'subagent-task-1-1700000000000',
}

const added = (parts: MessageRow['message']['parts']) => ({
  type: 'subagent_message_added',
  data: { context, message: { id: '', role: 'assistant', parts } },
})

const delta = (seq: number, body: Record<string, unknown>) => ({
  type: 'subagent_message_delta',
  data: {
    context,
    deltas: [
      {
        messageId: context.subagentMessageId,
        threadId: 'thread-1',
        seq,
        ...body,
      },
    ],
  },
})

const append = (seq: number, text: string) =>
  delta(seq, { type: 'text_append', partIndex: 0, partType: 'text', text })

describe('subagent event routing', () => {
  it('routes by context.threadId and ignores other threads', () => {
    expect(subagentEventContext('thread-1', added([]))).toEqual(context)
    expect(subagentEventContext('thread-2', added([]))).toBeUndefined()
    expect(
      subagentEventContext('thread-1', {
        type: 'message_delta',
        data: { threadId: 'thread-1', context },
      }),
    ).toBeUndefined()
    expect(
      subagentEventContext('thread-1', {
        type: 'subagent_message_delta',
        data: { context: { threadId: 'thread-1' }, deltas: [] },
      }),
    ).toBeUndefined()
  })

  it('recognizes ordinary message_delta frames that belong to a sub-agent', () => {
    const known = new Set(['custom-live-id'])
    expect(
      isSubagentMessageId('thread-1', context.subagentMessageId, known),
    ).toBe(true)
    expect(
      isSubagentMessageId(
        'thread-1',
        `thread-1--${context.subagentMessageId}`,
        known,
      ),
    ).toBe(true)
    expect(isSubagentMessageId('thread-1', 'custom-live-id', known)).toBe(true)
    expect(isSubagentMessageId('thread-1', 'thread-1--msg-2', known)).toBe(
      false,
    )
  })
})

describe('SubagentRuns', () => {
  it('attaches the run to its parent tool call and streams deltas', () => {
    const runs = new SubagentRuns()
    expect(runs.apply(added([{ type: 'text', text: 'Rea' }]))).toEqual({
      changed: true,
      needsSnapshot: false,
    })
    runs.apply(append(1, 'ding'))
    const [row] = runs.rows
    expect(row.parentToolCallId).toBe('call-task')
    expect(row.message.id).toBe(context.subagentMessageId)
    expect(row.message.parts[0].text).toBe('Reading')
    expect(runs.isStreaming(context.subagentMessageId)).toBe(true)
  })

  it('parks deltas for an unknown run and replays them after the snapshot without duplicates', () => {
    const runs = new SubagentRuns()
    // Opened mid-run: seq 3 and 4 arrive before any added event.
    expect(runs.apply(append(3, 'C'))).toEqual({
      changed: false,
      needsSnapshot: true,
    })
    runs.apply(append(4, 'D'))
    // The live snapshot already contains everything through seq 3.
    runs.applySnapshots([
      {
        context,
        lastSeq: 3,
        message: {
          id: '',
          role: 'assistant',
          parts: [{ type: 'text', text: 'ABC' }],
        },
      },
    ])
    expect(runs.rows[0].message.parts[0].text).toBe('ABCD')
    runs.apply(append(4, 'D'))
    runs.apply(append(5, 'E'))
    expect(runs.rows[0].message.parts[0].text).toBe('ABCDE')
  })

  it('keeps a newer streamed copy over an older snapshot', () => {
    const runs = new SubagentRuns()
    runs.apply(added([{ type: 'text', text: '' }]))
    runs.apply(append(1, 'A'))
    runs.apply(append(2, 'B'))
    runs.applySnapshots([
      {
        context,
        lastSeq: 1,
        message: {
          id: '',
          role: 'assistant',
          parts: [{ type: 'text', text: 'A' }],
        },
      },
    ])
    expect(runs.rows[0].message.parts[0].text).toBe('AB')
    runs.apply(append(3, 'C'))
    expect(runs.rows[0].message.parts[0].text).toBe('ABC')
  })

  it('replaces the run with the final message on completion', () => {
    const runs = new SubagentRuns()
    runs.apply(added([{ type: 'text', text: 'part' }]))
    runs.apply({
      type: 'subagent_message_completed',
      data: {
        context,
        deltas: [],
        finalMessage: {
          id: '',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Final answer' }],
        },
      },
    })
    expect(runs.rows[0].message.parts[0].text).toBe('Final answer')
    expect(runs.isStreaming(context.subagentMessageId)).toBe(false)
  })
})

describe('nested rows', () => {
  const dbRow = (id: string, parent: string, text: string): MessageRow =>
    ({
      id: `thread-1--${id}`,
      threadId: 'thread-1',
      parentToolCallId: parent,
      message: { id, role: 'assistant', parts: [{ type: 'text', text }] },
    }) as MessageRow

  it('groups persisted rows by parent and lets the live copy win', () => {
    const runs = new SubagentRuns()
    runs.apply(added([{ type: 'text', text: 'live' }]))
    const rows = [
      {
        id: 'thread-1--msg-1',
        threadId: 'thread-1',
        message: { id: 'msg-1', role: 'assistant', parts: [] },
      } as MessageRow,
      dbRow(context.subagentMessageId, 'call-task', 'stale'),
      dbRow('subagent-task-2-1', 'call-other', 'other'),
    ]
    const grouped = nestedRowsByParent(rows, runs.rows)
    expect(
      grouped.get('call-task')?.map((row) => row.message.parts[0].text),
    ).toEqual(['live'])
    expect(grouped.get('call-other')).toHaveLength(1)
    expect(grouped.has('msg-1')).toBe(false)
  })

  it('reuses unchanged groups so memoized cards skip re-rendering', () => {
    const other = dbRow('subagent-task-2-1', 'call-other', 'other')
    const first = nestedRowsByParent([other], [])
    const second = nestedRowsByParent([other], [], first)
    expect(second.get('call-other')).toBe(first.get('call-other'))
  })

  it('summarizes the latest sub-agent activity compactly', () => {
    const row = dbRow('a', 'call-task', 'First line\nChecking the tests')
    expect(latestSubagentActivity([row])).toBe('Checking the tests')
    expect(
      latestSubagentActivity([
        {
          ...row,
          message: {
            ...row.message,
            parts: [
              { type: 'step-start' },
              {
                type: 'tool-Read',
                toolCallId: 'r1',
                state: 'input-available',
                input: { file_path: '/repo/src/app.ts' },
              },
            ],
          },
        },
      ]),
    ).toBe('Read app.ts')
    expect(latestSubagentActivity([])).toBeUndefined()
  })
})
