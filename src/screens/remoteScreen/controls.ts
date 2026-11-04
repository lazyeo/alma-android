export interface Point {
  x: number
  y: number
}

export function directPointerEvent(
  action: 'move' | 'click' | 'double' | 'right' | 'drag-start' | 'drag-end',
  point: Point,
): ControlEvent {
  return {
    type: 'pointer',
    action:
      action === 'drag-start' ? 'down' : action === 'drag-end' ? 'up' : action,
    ...point,
  }
}

export interface KeyModifiers {
  meta?: boolean
  alt?: boolean
  ctrl?: boolean
  shift?: boolean
}

const KEY_NAMES: Record<string, string> = {
  Escape: 'esc',
  Esc: 'esc',
  Tab: 'tab',
  Enter: 'enter',
  Backspace: 'backspace',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

export function buildKeyCombo(modifiers: KeyModifiers, key: string) {
  const parts = [
    modifiers.meta ? 'cmd' : '',
    modifiers.alt ? 'alt' : '',
    modifiers.ctrl ? 'ctrl' : '',
    modifiers.shift ? 'shift' : '',
    KEY_NAMES[key] ?? key.toLowerCase(),
  ]
  return parts.filter(Boolean).join('+')
}

export type ControlEvent =
  | {
      type: 'pointer'
      action: 'move' | 'down' | 'up' | 'click' | 'double' | 'right' | 'middle'
      x: number
      y: number
      button?: 'left' | 'right' | 'middle'
    }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number }

type ScrollEvent = Extract<ControlEvent, { type: 'scroll' }>

/**
 * Sums scroll deltas and sends at most once per interval, at the latest
 * position. Sending every touch event piles up in the relay and causes
 * latency spikes. Deltas go out as whole pixels; the fraction carries over.
 */
export function createScrollCoalescer(
  send: (value: ScrollEvent) => void,
  intervalMs = 33,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let point: { x: number; y: number } | undefined
  let dx = 0
  let dy = 0
  let closed = false
  const emit = () => {
    if (closed || !point) return false
    const wholeX = Math.trunc(dx)
    const wholeY = Math.trunc(dy)
    if (!wholeX && !wholeY) return false
    dx -= wholeX
    dy -= wholeY
    send({ type: 'scroll', ...point, dx: wholeX, dy: wholeY })
    return true
  }
  const tick = () => {
    timer = undefined
    if (emit()) timer = setTimeout(tick, intervalMs)
  }
  return {
    push(value: ScrollEvent) {
      if (closed) return
      point = { x: value.x, y: value.y }
      dx += value.dx
      dy += value.dy
      if (!timer && emit()) timer = setTimeout(tick, intervalMs)
    },
    /** Sends whatever whole pixels are waiting and drops the remainder. */
    flush() {
      emit()
      dx = 0
      dy = 0
    },
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      timer = undefined
    },
  }
}

export function createMoveCoalescer<T>(
  send: (value: T) => void,
  intervalMs = 33,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: T | undefined
  let closed = false
  const flush = () => {
    timer = undefined
    if (closed || pending === undefined) return
    const value = pending
    pending = undefined
    send(value)
    timer = setTimeout(flush, intervalMs)
  }
  return {
    push(value: T) {
      if (closed) return
      if (!timer) {
        send(value)
        timer = setTimeout(flush, intervalMs)
      } else pending = value
    },
    flush() {
      if (closed || pending === undefined) return
      const value = pending
      pending = undefined
      send(value)
    },
    close() {
      closed = true
      pending = undefined
      if (timer) clearTimeout(timer)
      timer = undefined
    },
  }
}
