import { describe, expect, it } from 'vitest'
import { shouldClaimSidebarSwipe } from '../layout/sidebarSwipe'
import {
  PULL_REFRESH_COMMIT_PX,
  PULL_REFRESH_MAX_PX,
  pullRefreshDistance,
  shouldClaimPullRefresh,
  shouldCommitPullRefresh,
} from './pullToRefresh'

describe('pull-to-refresh model', () => {
  it('claims a clear downward pull only at the top of the list', () => {
    expect(shouldClaimPullRefresh(0, 12, 0)).toBe(true)
    expect(shouldClaimPullRefresh(0, 12, 40)).toBe(false)
    expect(shouldClaimPullRefresh(0, 6, 0)).toBe(false)
    expect(shouldClaimPullRefresh(0, -20, 0)).toBe(false)
  })

  it('leaves horizontal and diagonal drags to the sidebar and row swipes', () => {
    expect(shouldClaimPullRefresh(30, 12, 0)).toBe(false)
    expect(shouldClaimPullRefresh(12, 15, 0)).toBe(false)
    // No drag is claimable by both the pull and the horizontal sidebar swipe.
    for (const [dx, dy] of [
      [10, 10],
      [20, 13],
      [14, 30],
      [40, 12],
    ])
      expect(
        shouldClaimPullRefresh(dx, dy, 0) &&
          shouldClaimSidebarSwipe(dx, dy, true),
      ).toBe(false)
  })

  it('resists the finger and caps the indicator', () => {
    expect(pullRefreshDistance(-10)).toBe(0)
    expect(pullRefreshDistance(40)).toBe(20)
    expect(pullRefreshDistance(10_000)).toBe(PULL_REFRESH_MAX_PX)
  })

  it('commits only past the threshold', () => {
    expect(shouldCommitPullRefresh(PULL_REFRESH_COMMIT_PX - 1)).toBe(false)
    expect(shouldCommitPullRefresh(PULL_REFRESH_COMMIT_PX)).toBe(true)
  })
})
