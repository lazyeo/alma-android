// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  canScrollableAncestorConsume,
  sidebarSwipeProgress,
  shouldClaimSidebarSwipe,
  shouldCommitSidebarSwipe,
} from './sidebarSwipe'

describe('sidebar swipe', () => {
  it('claims only a deliberate horizontal drag in the allowed direction', () => {
    expect(shouldClaimSidebarSwipe(-10, 4, false)).toBe(true)
    expect(shouldClaimSidebarSwipe(10, 4, true)).toBe(true)
    expect(shouldClaimSidebarSwipe(10, 4, false)).toBe(false)
    expect(shouldClaimSidebarSwipe(-10, 7, false)).toBe(false)
  })

  it('maps drag distance to open progress', () => {
    expect(sidebarSwipeProgress(-120, 300, false)).toBeCloseTo(0.6)
    expect(sidebarSwipeProgress(120, 300, true)).toBeCloseTo(0.4)
    expect(sidebarSwipeProgress(-400, 300, false)).toBe(0)
  })

  it('commits by progress or velocity in the drag direction', () => {
    expect(shouldCommitSidebarSwipe(0.59, -0.1, false)).toBe(true)
    expect(shouldCommitSidebarSwipe(0.7, -0.31, false)).toBe(true)
    expect(shouldCommitSidebarSwipe(0.41, 0.1, true)).toBe(true)
    expect(shouldCommitSidebarSwipe(0.2, 0.31, true)).toBe(true)
    expect(shouldCommitSidebarSwipe(0.7, -0.1, false)).toBe(false)
  })

  it('detects a horizontally scrollable ancestor that can consume the drag', () => {
    const scroller = document.createElement('div')
    const child = document.createElement('span')
    scroller.append(child)
    Object.defineProperties(scroller, {
      scrollWidth: { value: 300 },
      clientWidth: { value: 100 },
      scrollLeft: { value: 50, writable: true },
    })
    scroller.style.overflowX = 'auto'
    expect(canScrollableAncestorConsume(child, -10)).toBe(true)
    expect(canScrollableAncestorConsume(child, 10)).toBe(true)
    scroller.scrollLeft = 0
    expect(canScrollableAncestorConsume(child, 10)).toBe(false)
  })
})
