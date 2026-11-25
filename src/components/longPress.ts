import { DUR_HOLD_MS } from '../motionTokens'

export function createLongPress(action: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin = { x: 0, y: 0 }
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return {
    start(x: number, y: number) {
      cancel()
      origin = { x, y }
      timer = setTimeout(() => {
        timer = undefined
        action()
      }, DUR_HOLD_MS)
    },
    move(x: number, y: number) {
      if (Math.hypot(x - origin.x, y - origin.y) > 8) cancel()
    },
    cancel,
    /** Still waiting out the delay: not fired, cancelled or moved off. */
    pending: () => timer !== undefined,
  }
}
