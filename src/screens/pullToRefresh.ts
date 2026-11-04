/** Same intent distance as the sidebar swipe before a drag is claimed. */
export const PULL_REFRESH_INTENT_PX = 10
/** Indicator height at which releasing refreshes. */
export const PULL_REFRESH_COMMIT_PX = 64
/** The indicator stops following the finger here. */
export const PULL_REFRESH_MAX_PX = 96
/** Half-speed follow, so the pull feels weighted like native overscroll. */
const PULL_REFRESH_RESISTANCE = 0.5

/**
 * A downward drag from the very top of the list. Vertical must beat 1.5×
 * horizontal: the mirror of the sidebar/GTD rule, so no drag is ever
 * claimable by both the pull and a horizontal swipe.
 */
export function shouldClaimPullRefresh(
  dx: number,
  dy: number,
  scrollTop: number,
) {
  return (
    scrollTop <= 0 && dy >= PULL_REFRESH_INTENT_PX && dy > 1.5 * Math.abs(dx)
  )
}

export function pullRefreshDistance(dy: number) {
  return Math.min(
    PULL_REFRESH_MAX_PX,
    Math.max(0, dy) * PULL_REFRESH_RESISTANCE,
  )
}

export function shouldCommitPullRefresh(distance: number) {
  return distance >= PULL_REFRESH_COMMIT_PX
}
