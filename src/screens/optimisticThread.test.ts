import { describe, expect, it } from 'vitest'
import type { MessagePart, MessageRow } from '../relay'
import {
  createOptimisticThreadState,
  optimisticThreadReducer,
  pendingStatusText,
  phaseFromProgressEvent,
} from './optimisticThread'

const textParts = (text: string): MessagePart[] => [{ type: 'text', text }]
const serverRow = (
  rowId: string,
  messageId: string,
  role: 'user' | 'assistant',
  text: string,
): MessageRow => ({
  id: rowId,
  threadId: 'thread-1',
  message: { id: messageId, role, parts: textParts(text) },
  timestamp: 200,
})

describe('optimistic thread state', () => {
  it('discards an optimistic first-send row after queue fallback succeeds', () => {
    const sent = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'sent',
      threadId: 'thread-1',
      messageId: 'first-1',
      parts: textParts('hello'),
      sentAt: 10,
    })

    expect(
      optimisticThreadReducer(sent, {
        type: 'discard_optimistic',
        messageId: 'first-1',
      }),
    ).toEqual({ rows: [], pending: undefined })
  })

  it('inserts a pending user row and reconciles it by message id without a duplicate', () => {
    let state = createOptimisticThreadState([])
    state = optimisticThreadReducer(state, {
      type: 'sent',
      threadId: 'thread-1',
      messageId: 'local-1',
      parts: textParts('Hello'),
      sentAt: 100,
    })

    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({
      id: 'optimistic:local-1',
      message: { id: 'local-1', role: 'user' },
      metadata: { optimisticStatus: 'pending' },
    })
    expect(state.pending).toMatchObject({ sentAt: 100 })

    state = optimisticThreadReducer(state, {
      type: 'message_added',
      row: serverRow('thread-1--local-1', 'local-1', 'user', 'Hello'),
    })

    expect(state.rows).toEqual([
      serverRow('thread-1--local-1', 'local-1', 'user', 'Hello'),
    ])
  })

  it('falls back to content matching and ignores a duplicate message_added', () => {
    let state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'sent',
      threadId: 'thread-1',
      messageId: 'local-1',
      parts: textParts('Same text'),
      sentAt: 100,
    })
    const row = serverRow('server-row', 'server-id', 'user', 'Same text')

    state = optimisticThreadReducer(state, { type: 'message_added', row })
    state = optimisticThreadReducer(state, { type: 'message_added', row })

    expect(state.rows).toEqual([row])
  })

  it('marks the optimistic row failed and keeps its retry payload', () => {
    let state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'sent',
      threadId: 'thread-1',
      messageId: 'local-1',
      parts: textParts('Try me'),
      sentAt: 100,
    })
    state = optimisticThreadReducer(state, {
      type: 'generation_error',
      error: 'Provider unavailable',
    })

    expect(state.rows[0].metadata).toMatchObject({
      optimisticStatus: 'failed',
      optimisticError: 'Provider unavailable',
    })
    expect(state.pending).toBeUndefined()
  })

  it('replaces the edited branch immediately on edit-resend', () => {
    const before = [
      serverRow('user-old', 'u-old', 'user', 'Old'),
      serverRow('assistant-old', 'a-old', 'assistant', 'Old reply'),
    ]
    const state = optimisticThreadReducer(createOptimisticThreadState(before), {
      type: 'sent',
      threadId: 'thread-1',
      messageId: 'local-edit',
      parts: textParts('Corrected'),
      sentAt: 100,
      replaceMessageId: 'user-old',
    })

    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({
      message: { id: 'local-edit', parts: textParts('Corrected') },
      metadata: { optimisticStatus: 'pending' },
    })
  })

  it('shows a pending assistant when an already-generating thread opens empty', () => {
    const state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'generating_open',
      threadId: 'thread-1',
      startedAt: 500,
    })

    expect(state.pending).toEqual({
      threadId: 'thread-1',
      sentAt: 500,
      phase: undefined,
    })
    expect(pendingStatusText(state.pending, 2600)).toBe('Thinking 2s')
  })

  it('renders live phase messages and removes the placeholder on assistant content', () => {
    let state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'generating_open',
      threadId: 'thread-1',
      startedAt: 500,
    })
    state = optimisticThreadReducer(state, {
      type: 'phase',
      phase: { kind: 'memory', message: 'Retrieving memories…' },
    })
    expect(pendingStatusText(state.pending, 1000)).toBe('Retrieving memories…')

    state = optimisticThreadReducer(state, {
      type: 'message_added',
      row: serverRow(
        'assistant-new',
        'assistant-new',
        'assistant',
        'First token',
      ),
    })
    expect(state.pending).toBeUndefined()
  })

  it('keeps one unreconciled optimistic row across fetched-row syncs', () => {
    const serverBeforeSend = serverRow('old-row', 'old', 'assistant', 'Earlier')
    let state = optimisticThreadReducer(
      createOptimisticThreadState([serverBeforeSend]),
      {
        type: 'sent',
        threadId: 'thread-1',
        messageId: 'local-1',
        parts: textParts('Hello'),
        sentAt: 100,
      },
    )

    state = optimisticThreadReducer(state, {
      type: 'sync_rows',
      rows: [serverBeforeSend],
    })

    expect(state.rows).toEqual([
      serverBeforeSend,
      expect.objectContaining({
        id: 'optimistic:local-1',
        message: expect.objectContaining({ id: 'local-1' }),
      }),
    ])
    expect(state.pending).toBeDefined()
  })

  it('drops an optimistic row when its server copy appears in fetched rows', () => {
    const serverCopy = serverRow(
      'thread-1--local-1',
      'local-1',
      'user',
      'Hello',
    )
    let state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'sent',
      threadId: 'thread-1',
      messageId: 'local-1',
      parts: textParts('Hello'),
      sentAt: 100,
    })

    state = optimisticThreadReducer(state, {
      type: 'sync_rows',
      rows: [serverCopy],
    })

    expect(state.rows).toEqual([serverCopy])
    expect(
      state.rows.filter((row) => row.id.startsWith('optimistic:')),
    ).toHaveLength(0)
  })

  it('clears the pending placeholder when fetched assistant content appears', () => {
    let state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'generating_open',
      threadId: 'thread-1',
      startedAt: 500,
    })
    const assistant = serverRow(
      'assistant-new',
      'assistant-new',
      'assistant',
      'First token',
    )

    state = optimisticThreadReducer(state, {
      type: 'sync_rows',
      rows: [assistant],
    })

    expect(state.rows).toEqual([assistant])
    expect(state.pending).toBeUndefined()
  })

  it('does not create duplicate pending state when generating_open repeats', () => {
    let state = optimisticThreadReducer(createOptimisticThreadState([]), {
      type: 'generating_open',
      threadId: 'thread-1',
      startedAt: 500,
    })
    const pending = state.pending

    state = optimisticThreadReducer(state, {
      type: 'generating_open',
      threadId: 'thread-1',
      startedAt: 900,
    })

    expect(state.pending).toBe(pending)
    expect(state.rows).toEqual([])
  })

  it('uses phase event messages when present and fallback text otherwise', () => {
    expect(
      phaseFromProgressEvent('memory_retrieval_progress', {
        message: 'Memories retrieved',
      }),
    ).toEqual({ kind: 'memory', message: 'Memories retrieved' })
    expect(
      phaseFromProgressEvent('skill_analysis_progress', {
        message: 'Selected 1 skill',
      }),
    ).toEqual({ kind: 'skill', message: 'Selected 1 skill' })
    expect(
      phaseFromProgressEvent('memory_retrieval_progress', {
        stage: 'searching',
      }),
    ).toEqual({ kind: 'memory', message: 'Retrieving memories…' })
    expect(
      phaseFromProgressEvent('skill_analysis_progress', { message: '   ' }),
    ).toEqual({ kind: 'skill', message: 'Choosing skills…' })
  })
})
