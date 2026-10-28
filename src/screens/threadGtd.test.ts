import { describe, expect, it } from 'vitest'
import type { MessageRow, Thread } from '../relay'
import {
  applyThreadUpdate,
  autoTodo,
  favoritePinUpdate,
  favoriteUpdate,
  findAutoTodoMessage,
  gtdStatusUpdate,
  rollbackThreadUpdate,
  threadGtdStatus,
} from './threadGtd'

const thread = (
  id: string,
  metadata: Record<string, unknown> = {},
): Thread => ({
  id,
  metadata,
})

const message = (id: string, text: string, timestamp: number): MessageRow => ({
  id,
  threadId: 'thread-1',
  timestamp,
  message: {
    id: `message-${id}`,
    role: 'user',
    parts: [{ type: 'text', text }],
  },
})

describe('mobile GTD metadata', () => {
  it('parses only desktop GTD status values', () => {
    expect(threadGtdStatus(thread('todo', { gtdStatus: 'todo' }))).toBe('todo')
    expect(
      threadGtdStatus(thread('progress', { gtdStatus: 'in_progress' })),
    ).toBe('in_progress')
    expect(
      threadGtdStatus(thread('unknown', { gtdStatus: 'later' })),
    ).toBeUndefined()
  })

  it('parses a complete autoTodo and rejects partial metadata', () => {
    expect(
      autoTodo(
        thread('a', {
          autoTodo: {
            what: 'Ship the mobile polish',
            quote: 'please ship this tomorrow',
            at: '2026-10-24T07:28:00.000Z',
          },
        }),
      ),
    ).toEqual({
      what: 'Ship the mobile polish',
      quote: 'please ship this tomorrow',
      at: '2026-10-24T07:28:00.000Z',
    })
    expect(
      autoTodo(thread('b', { autoTodo: { what: 'Missing quote' } })),
    ).toBeUndefined()
  })

  it('matches the quoted user message nearest to autoTodo.at', () => {
    const rows = [
      message('old', 'Please ship this tomorrow after review.', 100),
      message('other', 'A different message.', 180),
      message('new', 'please ship this tomorrow once tests pass', 260),
    ]
    expect(
      findAutoTodoMessage(rows, {
        what: 'Ship it',
        quote: 'please ship this tomorrow',
        at: 230,
      })?.id,
    ).toBe('new')
  })

  it('builds the desktop-compatible status update without clearing autoTodo', () => {
    expect(
      gtdStatusUpdate(
        thread('a', {
          gtdStatus: 'todo',
          autoTodo: { what: 'Ship it', quote: 'ship it', at: 100 },
          labelIds: ['release'],
        }),
        'done',
      ),
    ).toEqual({
      metadata: {
        gtdStatus: 'done',
        autoTodo: { what: 'Ship it', quote: 'ship it', at: 100 },
        labelIds: ['release'],
      },
      skipUpdatedAt: true,
    })
  })
})

describe('desktop-compatible organize writes', () => {
  it('sends top-level skipUpdatedAt on every status and favorite write', () => {
    const row = thread('a')
    for (const update of [
      gtdStatusUpdate(row, 'archived'),
      favoriteUpdate(row, true),
      favoriteUpdate(row, false),
      favoritePinUpdate({ ...row, isFavorited: true }, [], true),
      favoritePinUpdate({ ...row, isFavorited: true }, [], false),
    ])
      expect(update.skipUpdatedAt).toBe(true)
  })

  it('favorites without touching pin state, and un-favoriting clears pin and order', () => {
    expect(favoriteUpdate(thread('a'), true)).toEqual({
      isFavorited: true,
      skipUpdatedAt: true,
    })
    expect(
      favoriteUpdate(
        {
          ...thread('a'),
          isFavorited: true,
          isFavoritePinned: true,
          favoritePinnedOrder: 4,
        },
        false,
      ),
    ).toEqual({
      isFavorited: false,
      isFavoritePinned: false,
      favoritePinnedOrder: null,
      skipUpdatedAt: true,
    })
  })

  it('pins after the highest current pinned favorite and clears order on unpin', () => {
    const all: Thread[] = [
      {
        id: 'p1',
        isFavorited: true,
        isFavoritePinned: true,
        favoritePinnedOrder: 2,
      },
      {
        id: 'p2',
        isFavorited: true,
        isFavoritePinned: true,
        favoritePinnedOrder: 5,
      },
      // Stale order on a no-longer-pinned or no-longer-favorite row is ignored.
      {
        id: 'u1',
        isFavorited: true,
        isFavoritePinned: false,
        favoritePinnedOrder: 9,
      },
      {
        id: 'u2',
        isFavorited: false,
        isFavoritePinned: true,
        favoritePinnedOrder: 12,
      },
      { id: 'p3', isFavorited: true, isFavoritePinned: true },
    ]
    const target: Thread = { id: 'new', isFavorited: true }
    expect(favoritePinUpdate(target, all, true)).toEqual({
      isFavoritePinned: true,
      favoritePinnedOrder: 6,
      skipUpdatedAt: true,
    })
    expect(favoritePinUpdate(target, [], true).favoritePinnedOrder).toBe(1)
    expect(favoritePinUpdate(all[0], all, false)).toEqual({
      isFavoritePinned: false,
      favoritePinnedOrder: null,
      skipUpdatedAt: true,
    })
  })

  it('applies an update optimistically while preserving updatedAt', () => {
    const row: Thread = {
      id: 'a',
      title: 'Keep me',
      updatedAt: '2026-10-20T00:00:00.000Z',
      metadata: { gtdStatus: 'todo', labelIds: ['x'] },
    }
    const next = applyThreadUpdate(row, gtdStatusUpdate(row, 'done'))
    expect(next).toEqual({
      id: 'a',
      title: 'Keep me',
      updatedAt: '2026-10-20T00:00:00.000Z',
      metadata: { gtdStatus: 'done', labelIds: ['x'] },
    })
    expect(next).not.toHaveProperty('skipUpdatedAt')
    expect(
      applyThreadUpdate(
        {
          ...row,
          isFavorited: true,
          isFavoritePinned: true,
          favoritePinnedOrder: 3,
        },
        favoriteUpdate(row, false),
      ),
    ).toMatchObject({
      isFavorited: false,
      isFavoritePinned: false,
      favoritePinnedOrder: null,
      updatedAt: '2026-10-20T00:00:00.000Z',
    })
  })
})

describe('organize rollback', () => {
  it('restores only the fields a failed write touched', () => {
    const before: Thread = {
      id: 'a',
      isFavorited: true,
      isFavoritePinned: true,
      favoritePinnedOrder: 2,
      metadata: { gtdStatus: 'todo' },
    }
    const update = favoriteUpdate(before, false)
    // A realtime title change landed while the write was in flight.
    const current = { ...applyThreadUpdate(before, update), title: 'Renamed' }
    expect(rollbackThreadUpdate(current, before, update)).toEqual({
      ...before,
      title: 'Renamed',
    })
  })

  it('removes fields that did not exist before the write', () => {
    const before: Thread = { id: 'a' }
    const update = favoritePinUpdate(before, [], true)
    const restored = rollbackThreadUpdate(
      applyThreadUpdate(before, update),
      before,
      update,
    )
    expect(restored).toEqual({ id: 'a' })
  })
})
