import { describe, expect, it, vi } from 'vitest'
import type { MessageRow } from '../relay'
import { AlmaHttpError } from '../relay/almaApi'
import {
  applyReactionOp,
  isReactionsRouteMissing,
  parseReactions,
  toggleOp,
  toggleReaction,
  withReactions,
  type MessageReaction,
} from './messageReactions'
import { DeltaAccumulator } from './threadDeltas'

const AT = '2026-11-06T10:00:00.000Z'

function userRow(reactions?: unknown): MessageRow {
  return {
    id: 'thread-1--msg-1',
    threadId: 'thread-1',
    message: {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    },
    metadata: reactions === undefined ? {} : { reactions },
  }
}

const eyes: MessageReaction = { emoji: '👀', reactedAt: AT, by: 'assistant' }
const thumbs: MessageReaction = { emoji: '👍', reactedAt: AT, by: 'user' }

describe('parseReactions', () => {
  it('reads the desktop shape: absent `by` is the user, `assistant` is Alma', () => {
    expect(
      parseReactions(
        userRow([
          { emoji: '👀', reactedAt: AT, by: 'assistant' },
          { emoji: '👍', reactedAt: AT },
        ]).metadata,
      ),
    ).toEqual([eyes, thumbs])
  })

  it('drops invalid and duplicate entries like the desktop normalizer', () => {
    expect(
      parseReactions(
        userRow([
          { emoji: '👍', reactedAt: AT },
          { emoji: '👍', reactedAt: AT, by: 'assistant' },
          { emoji: 'ok' },
          { emoji: ' 🎉' },
          null,
          { emoji: '❤️', reactedAt: 5, by: 'someone' },
        ]).metadata,
      ),
    ).toEqual([thumbs, { emoji: '❤️', reactedAt: '', by: 'user' }])
  })

  it('treats missing or malformed metadata as no reactions', () => {
    expect(parseReactions(undefined)).toEqual([])
    expect(parseReactions({})).toEqual([])
    expect(parseReactions({ reactions: { emoji: '👍' } })).toEqual([])
  })
})

describe('reaction ops', () => {
  it('removes only the user’s own reaction; Alma’s emoji is an add', () => {
    expect(toggleOp([thumbs], '👍')).toBe('remove')
    expect(toggleOp([eyes], '👀')).toBe('add')
    expect(toggleOp([], '🎉')).toBe('add')
  })

  it('matches the desktop: adding a present emoji is a no-op', () => {
    const current = [eyes]
    expect(applyReactionOp(current, '👀', 'add', AT)).toBe(current)
    expect(applyReactionOp(current, '🎉', 'add', AT)).toEqual([
      eyes,
      { emoji: '🎉', reactedAt: AT, by: 'user' },
    ])
    expect(applyReactionOp([thumbs, eyes], '👍', 'remove')).toEqual([eyes])
  })

  it('refuses a 13th reaction', () => {
    const full = [...'😀😁😂🤣😃😄😅😆😉😊😋😎'].map((emoji) => ({
      emoji,
      reactedAt: AT,
      by: 'user' as const,
    }))
    expect(full).toHaveLength(12)
    expect(applyReactionOp(full, '👍', 'add')).toBeNull()
  })

  it('writes the wire shape back without `by` for the user', () => {
    expect(withReactions(userRow(), [eyes, thumbs]).metadata).toEqual({
      reactions: [
        { emoji: '👀', reactedAt: AT, by: 'assistant' },
        { emoji: '👍', reactedAt: AT },
      ],
    })
  })
})

describe('toggleReaction', () => {
  function deps(send: () => Promise<MessageRow>) {
    return { show: vi.fn(), send: vi.fn(send), confirm: vi.fn() }
  }

  it('shows the change first, then confirms the desktop row', async () => {
    const updated = userRow([{ emoji: '👍', reactedAt: AT }])
    const d = deps(async () => updated)
    await expect(toggleReaction([], '👍', d)).resolves.toEqual({
      outcome: 'applied',
    })
    expect(d.send).toHaveBeenCalledWith('👍', 'add')
    expect(d.show).toHaveBeenCalledTimes(1)
    expect(d.show.mock.calls[0][0]).toMatchObject([{ emoji: '👍', by: 'user' }])
    expect(d.confirm).toHaveBeenCalledWith(updated)
  })

  it('removes the user’s own reaction', async () => {
    const d = deps(async () => userRow([]))
    await toggleReaction([thumbs, eyes], '👍', d)
    expect(d.send).toHaveBeenCalledWith('👍', 'remove')
    expect(d.show).toHaveBeenCalledWith([eyes])
  })

  it('rolls back and reports a failure', async () => {
    const error = new AlmaHttpError('POST failed (500): boom', 500)
    const d = deps(async () => Promise.reject(error))
    await expect(toggleReaction([eyes], '👍', d)).resolves.toEqual({
      outcome: 'failed',
      error,
    })
    expect(d.show).toHaveBeenLastCalledWith([eyes])
    expect(d.confirm).not.toHaveBeenCalled()
  })

  it('rolls back quietly on 409', async () => {
    const d = deps(async () =>
      Promise.reject(new AlmaHttpError('Too many reactions', 409)),
    )
    const result = await toggleReaction([], '👍', d)
    expect(result.outcome).toBe('conflict')
    expect(d.show).toHaveBeenLastCalledWith([])
  })

  it('reports an old desktop without the route as unsupported', async () => {
    const d = deps(async () =>
      Promise.reject(
        new AlmaHttpError(
          'POST /api/messages/m/reactions failed (404): <pre>Cannot POST',
          404,
        ),
      ),
    )
    expect((await toggleReaction([], '👍', d)).outcome).toBe('unsupported')
    expect(d.show).toHaveBeenLastCalledWith([])
  })

  it('sends nothing for a no-op or a full message', async () => {
    const d = deps(async () => userRow())
    expect((await toggleReaction([eyes], '👀', d)).outcome).toBe('unchanged')
    const full = [...'😀😁😂🤣😃😄😅😆😉😊😋😎'].map((emoji) => ({
      emoji,
      reactedAt: AT,
      by: 'user' as const,
    }))
    expect((await toggleReaction(full, '👍', d)).outcome).toBe('full')
    expect(d.send).not.toHaveBeenCalled()
    expect(d.show).not.toHaveBeenCalled()
  })
})

describe('isReactionsRouteMissing', () => {
  it('tells a missing route from a missing message', () => {
    expect(
      isReactionsRouteMissing(
        new AlmaHttpError('failed (404): Cannot POST', 404),
      ),
    ).toBe(true)
    expect(
      isReactionsRouteMissing(
        new AlmaHttpError('failed (404): {"error":"Message not found"}', 404),
      ),
    ).toBe(false)
    expect(isReactionsRouteMissing(new AlmaHttpError('boom', 500))).toBe(false)
  })
})

describe('message_updated merge', () => {
  it('replaces the cached reactions with the broadcast row', () => {
    const accumulator = new DeltaAccumulator()
    const cached = [userRow([{ emoji: '👍', reactedAt: AT }])]
    const broadcast = userRow([{ emoji: '👀', reactedAt: AT, by: 'assistant' }])
    const [merged] = accumulator.sync(cached, [broadcast], false)
    expect(parseReactions(merged.metadata)).toEqual([eyes])
  })

  it('clears chips when the last reaction is removed', () => {
    const accumulator = new DeltaAccumulator()
    const cached = [userRow([{ emoji: '👍', reactedAt: AT }])]
    const [merged] = accumulator.sync(cached, [userRow([])], false)
    expect(parseReactions(merged.metadata)).toEqual([])
  })
})
