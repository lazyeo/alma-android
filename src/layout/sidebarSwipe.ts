export const SIDEBAR_SWIPE_INTENT_PX = 10
export const SIDEBAR_SWIPE_THRESHOLD = 0.4
export const SIDEBAR_SWIPE_VELOCITY_PX_MS = 0.3

export function shouldClaimSidebarSwipe(
  dx: number,
  dy: number,
  collapsed: boolean,
) {
  return (
    Math.abs(dx) >= SIDEBAR_SWIPE_INTENT_PX &&
    Math.abs(dx) > 1.5 * Math.abs(dy) &&
    (collapsed ? dx > 0 : dx < 0)
  )
}

export function sidebarSwipeProgress(
  dx: number,
  fullWidth: number,
  collapsed: boolean,
) {
  const start = collapsed ? 0 : 1
  return Math.max(0, Math.min(1, start + dx / fullWidth))
}

export function shouldCommitSidebarSwipe(
  openProgress: number,
  velocityX: number,
  collapsed: boolean,
) {
  if (collapsed)
    return (
      openProgress > SIDEBAR_SWIPE_THRESHOLD ||
      velocityX > SIDEBAR_SWIPE_VELOCITY_PX_MS
    )
  return (
    openProgress < 1 - SIDEBAR_SWIPE_THRESHOLD ||
    velocityX < -SIDEBAR_SWIPE_VELOCITY_PX_MS
  )
}

function isHorizontalScroller(element: HTMLElement) {
  const style = getComputedStyle(element)
  return (
    element.scrollWidth > element.clientWidth &&
    /(auto|scroll)/.test(style.overflowX)
  )
}

export function canScrollableAncestorConsume(
  target: EventTarget | null,
  dx: number,
) {
  let element = target instanceof HTMLElement ? target : null
  while (element) {
    if (isHorizontalScroller(element)) {
      const max = element.scrollWidth - element.clientWidth
      if (
        (dx < 0 && element.scrollLeft < max) ||
        (dx > 0 && element.scrollLeft > 0)
      )
        return true
    }
    element = element.parentElement
  }
  return false
}
