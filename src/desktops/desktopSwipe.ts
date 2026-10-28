export const DESKTOP_SWIPE_INTENT_PX = 8
export const DESKTOP_SWIPE_THRESHOLD = 0.4
export const SWIPE_VELOCITY_PX_MS = 0.3
export const EDGE_RESISTANCE = 0.3

export function shouldClaimDesktopSwipe(dx: number, dy: number) {
  return Math.abs(dy) >= DESKTOP_SWIPE_INTENT_PX && Math.abs(dy) > Math.abs(dx)
}

export function desktopSwipeOffset(dy: number, hasNeighbor: boolean) {
  return hasNeighbor ? dy : dy * EDGE_RESISTANCE
}

export function wrapDesktopIndex(index: number, count: number) {
  return ((index % count) + count) % count
}

export function desktopSwipeTarget(
  dy: number,
  velocityY: number,
  height: number,
  currentIndex: number,
  count: number,
) {
  if (count <= 1) return null
  const direction = dy < 0 ? 1 : -1
  // The list loops: past the last desktop comes the first, and vice versa.
  const target = wrapDesktopIndex(currentIndex + direction, count)
  const distanceCommit = Math.abs(dy) > height * DESKTOP_SWIPE_THRESHOLD
  const velocityCommit =
    Math.abs(velocityY) > SWIPE_VELOCITY_PX_MS &&
    Math.sign(velocityY) === Math.sign(dy)
  return distanceCommit || velocityCommit ? target : null
}
