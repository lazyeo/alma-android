import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import { endReasonPresentation, usageForReply } from './replyMetadata'

const usage = (inputTokens: number) => ({
  inputTokens,
  outputTokens: 2,
  totalTokens: inputTokens + 2,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
})

const row = (metadata: MessageRow['metadata'] = {}): MessageRow => ({
  id: 'row-1',
  threadId: 'thread-1',
  message: { id: 'message-1', role: 'assistant', parts: [] },
  metadata,
})

describe('reply metadata', () => {
  it('prefers persisted row usage over generation completion fallback', () => {
    expect(usageForReply(row({ usage: usage(5) }), usage(99))).toEqual(usage(5))
    expect(usageForReply(row(), usage(99))).toEqual(usage(99))
  })

  it('maps end reasons to quiet labels and severity', () => {
    expect(endReasonPresentation('length')).toEqual({
      label: 'Stopped at length limit',
      tone: 'warning',
    })
    expect(endReasonPresentation('error')).toEqual({
      label: 'Ended with an error',
      tone: 'error',
    })
    expect(endReasonPresentation('stop')).toBeUndefined()
  })
})
