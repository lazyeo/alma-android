import { describe, expect, it } from 'vitest'
import {
  GTD_SWIPE_COMMIT_PX,
  GTD_SWIPE_EDGE_PX,
  GTD_SWIPE_INTENT_PX,
  GTD_SWIPE_MAX_PX,
  gtdSwipeAction,
  gtdSwipeArmed,
  gtdSwipeIntent,
  gtdSwipeOffset,
} from './gtdSwipe'

describe('GTD swipe mapping', () => {
  it.each([
    ['inbox', 'right', 'todo', 'To-do'],
    ['todo', 'right', 'in_progress', 'In progress'],
    ['in_progress', 'right', 'done', 'Done'],
    ['done', 'right', 'archived', 'Archived'],
    ['todo', 'left', 'inbox', 'Inbox'],
    ['in_progress', 'left', 'todo', 'To-do'],
    ['done', 'left', 'in_progress', 'In progress'],
    ['archived', 'left', 'done', 'Done'],
    ['inbox', 'left', 'archived', 'Archived'],
  ] as const)('maps %s %s to %s', (status, direction, targetStatus, label) => {
    expect(gtdSwipeAction(status, direction)).toEqual({
      status: targetStatus,
      label,
    })
  })

  it('offers no right-swipe action after Archived', () => {
    expect(gtdSwipeAction('archived', 'right')).toBeUndefined()
  })
})

describe('GTD swipe intent', () => {
  it('never starts inside the left Android back-gesture zone', () => {
    expect(GTD_SWIPE_EDGE_PX).toBeGreaterThanOrEqual(24)
    expect(gtdSwipeIntent(GTD_SWIPE_EDGE_PX - 1, 40, 0)).toBe('edge')
    expect(gtdSwipeIntent(GTD_SWIPE_EDGE_PX, 40, 0)).toBe('horizontal')
  })

  it('claims only after 10px of clearly horizontal movement', () => {
    expect(GTD_SWIPE_INTENT_PX).toBe(10)
    expect(gtdSwipeIntent(100, 9, 0)).toBe('pending')
    expect(gtdSwipeIntent(100, -10, 0)).toBe('horizontal')
    expect(gtdSwipeIntent(100, 15, 10)).toBe('pending')
    expect(gtdSwipeIntent(100, 16, 10)).toBe('horizontal')
  })

  it('yields to vertical scrolling once vertical movement wins', () => {
    expect(gtdSwipeIntent(100, 2, 10)).toBe('vertical')
    expect(gtdSwipeIntent(100, 12, 12)).toBe('vertical')
  })
})

describe('GTD swipe threshold and offset', () => {
  it('arms an action only at the commit distance in a mapped direction', () => {
    expect(gtdSwipeArmed(GTD_SWIPE_COMMIT_PX - 1, 'todo')).toBeUndefined()
    expect(gtdSwipeArmed(GTD_SWIPE_COMMIT_PX, 'todo')).toEqual({
      status: 'in_progress',
      label: 'In progress',
    })
    expect(gtdSwipeArmed(-GTD_SWIPE_COMMIT_PX, 'todo')?.status).toBe('inbox')
    expect(gtdSwipeArmed(GTD_SWIPE_COMMIT_PX * 2, 'archived')).toBeUndefined()
  })

  it('follows the finger up to a cap and stays put in unmapped directions', () => {
    expect(gtdSwipeOffset(40, 'todo', false)).toBe(40)
    expect(gtdSwipeOffset(-40, 'todo', false)).toBe(-40)
    expect(gtdSwipeOffset(GTD_SWIPE_MAX_PX + 50, 'todo', false)).toBe(
      GTD_SWIPE_MAX_PX,
    )
    expect(gtdSwipeOffset(60, 'archived', false)).toBe(0)
    expect(gtdSwipeOffset(-60, 'archived', false)).toBe(-60)
  })

  it('does not follow the finger with reduced motion', () => {
    expect(gtdSwipeOffset(60, 'todo', true)).toBe(0)
    // The action still commits from the release distance.
    expect(gtdSwipeArmed(GTD_SWIPE_COMMIT_PX, 'todo')?.status).toBe(
      'in_progress',
    )
  })
})
