import { describe, expect, it } from 'vitest'
import { messageRetry } from './messageRetry'

const row = (
  id: string,
  role: string,
  metadata?: { optimisticStatus?: unknown },
) => ({ id, message: { role }, metadata })

describe('messageRetry', () => {
  const rows = [
    row('u1', 'user'),
    row('a1', 'assistant'),
    row('u2', 'user'),
    row('a2', 'assistant'),
  ]

  it('retries an assistant reply itself', () => {
    expect(messageRetry(rows, rows[1])).toEqual({
      kind: 'retryReply',
      messageId: 'a1',
    })
  })

  it('retries the reply that follows the user message', () => {
    expect(messageRetry(rows, rows[2])).toEqual({
      kind: 'retryReply',
      messageId: 'a2',
    })
  })

  it('regenerates from the end when the user message has no reply', () => {
    const unanswered = [...rows, row('u3', 'user')]
    expect(messageRetry(unanswered, unanswered[4])).toEqual({
      kind: 'regenerate',
    })
  })

  it('offers nothing for a user message followed by another user message', () => {
    const stacked = [row('u1', 'user'), row('u2', 'user')]
    expect(messageRetry(stacked, stacked[0])).toBeUndefined()
  })

  it('resends a failed send and offers nothing while one is pending', () => {
    const failed = row('u3', 'user', { optimisticStatus: 'failed' })
    const pending = row('u4', 'user', { optimisticStatus: 'pending' })
    expect(messageRetry([...rows, failed], failed)).toEqual({ kind: 'resend' })
    expect(messageRetry([...rows, pending], pending)).toBeUndefined()
  })

  it('skips local-only replies that the desktop cannot address', () => {
    const streaming = [row('u1', 'user'), row('optimistic:a1', 'assistant')]
    expect(messageRetry(streaming, streaming[1])).toBeUndefined()
    expect(messageRetry(streaming, streaming[0])).toBeUndefined()
  })

  it('offers nothing for other roles or rows outside the list', () => {
    expect(messageRetry(rows, row('s1', 'system'))).toBeUndefined()
    expect(messageRetry(rows, row('u9', 'user'))).toBeUndefined()
  })
})
