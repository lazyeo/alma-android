import { describe, expect, it } from 'vitest'
import {
  desktopSwipeOffset,
  desktopSwipeTarget,
  shouldClaimDesktopSwipe,
} from './desktopSwipe'

describe('desktop title swipe', () => {
  it('claims only a deliberate vertical drag', () => {
    expect(shouldClaimDesktopSwipe(2, 7)).toBe(false)
    expect(shouldClaimDesktopSwipe(7, 8)).toBe(true)
    expect(shouldClaimDesktopSwipe(9, 8)).toBe(false)
  })

  it('uses resistance at the first and last desktop', () => {
    expect(desktopSwipeOffset(30, false)).toBe(9)
    expect(desktopSwipeOffset(-30, false)).toBe(-9)
    expect(desktopSwipeOffset(-30, true)).toBe(-30)
  })

  it('commits by distance or velocity without wrapping', () => {
    expect(desktopSwipeTarget(-20, -0.31, 60, 1, 3)).toBe(2)
    expect(desktopSwipeTarget(25, 0, 60, 1, 3)).toBe(0)
    // Loops past either end.
    expect(desktopSwipeTarget(-30, 0, 60, 2, 3)).toBe(0)
    expect(desktopSwipeTarget(30, 0, 60, 0, 3)).toBe(2)
    expect(desktopSwipeTarget(-30, 0, 60, 0, 1)).toBeNull()
    expect(desktopSwipeTarget(-20, 0, 60, 1, 3)).toBeNull()
  })
})
