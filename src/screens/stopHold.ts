export const STOP_HOLD_MS = 2000
export const STOP_MOVE_TOLERANCE_PX = 12

export type StopHoldPoint = { x: number; y: number }

type StopHoldInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

export function calculateStopHoldOffset({
  center,
  radius,
  viewport,
  safeArea = { top: 0, right: 0, bottom: 0, left: 0 },
  margin = 8,
}: {
  center: StopHoldPoint
  radius: number
  viewport: { width: number; height: number }
  safeArea?: StopHoldInsets
  margin?: number
}): StopHoldPoint {
  const minX = safeArea.left + margin + radius
  const maxX = viewport.width - safeArea.right - margin - radius
  const minY = safeArea.top + margin + radius
  const maxY = viewport.height - safeArea.bottom - margin - radius

  return {
    x: Math.min(maxX, Math.max(minX, center.x)) - center.x,
    y: Math.min(maxY, Math.max(minY, center.y)) - center.y,
  }
}

export type StopHoldState = {
  active: boolean
  startedAt: number
  origin?: StopHoldPoint
  progress: number
}

type StopHoldEvent =
  | { type: 'tick'; now: number }
  | { type: 'release'; now: number }
  | { type: 'cancel'; now: number }
  | { type: 'move'; now: number; point: StopHoldPoint }

export type StopHoldEffect = 'stop' | 'hint' | undefined

export function beginStopHold(
  now: number,
  origin?: StopHoldPoint,
): StopHoldState {
  return { active: true, startedAt: now, origin, progress: 0 }
}

export function stopHoldProgress(state: StopHoldState, now: number) {
  if (!state.active) return state.progress
  return Math.min(1, Math.max(0, (now - state.startedAt) / STOP_HOLD_MS))
}

export function updateStopHold(
  state: StopHoldState,
  event: StopHoldEvent,
): { state: StopHoldState; effect: StopHoldEffect } {
  if (!state.active) return { state, effect: undefined }
  const progress = stopHoldProgress(state, event.now)
  if (event.type === 'move' && state.origin) {
    const distance = Math.hypot(
      event.point.x - state.origin.x,
      event.point.y - state.origin.y,
    )
    if (distance > STOP_MOVE_TOLERANCE_PX)
      return {
        state: { ...state, active: false, progress: 0 },
        effect: undefined,
      }
  }
  if (event.type === 'cancel')
    return {
      state: { ...state, active: false, progress: 0 },
      effect: undefined,
    }
  if (progress >= 1)
    return {
      state: { ...state, active: false, progress: 1 },
      effect: 'stop',
    }
  if (event.type === 'release')
    return {
      state: { ...state, active: false, progress: 0 },
      effect: 'hint',
    }
  return { state: { ...state, progress }, effect: undefined }
}
