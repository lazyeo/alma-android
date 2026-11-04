export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface ViewTransform {
  scale: number
  x: number
  y: number
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))

export function mapClientPoint(
  point: Point,
  container: Size,
  content: Size,
  transform: ViewTransform,
) {
  const fit = Math.min(
    container.width / content.width,
    container.height / content.height,
  )
  const renderedWidth = content.width * fit
  const renderedHeight = content.height * fit
  const left = (container.width - renderedWidth) / 2
  const top = (container.height - renderedHeight) / 2
  const scale = Math.max(0.01, transform.scale)
  const localX = (point.x - transform.x - left) / scale
  const localY = (point.y - transform.y - top) / scale
  return {
    x: clamp(localX / renderedWidth),
    y: clamp(localY / renderedHeight),
    inside:
      localX >= 0 &&
      localX <= renderedWidth &&
      localY >= 0 &&
      localY <= renderedHeight,
  }
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

export interface TrackpadState {
  cursor: Point
  phase: 'idle' | 'dragging'
}

export type TrackpadGesture =
  | { type: 'move'; dx: number; dy: number; sensitivity: number }
  | { type: 'tap'; fingers: 1 | 2; clicks?: 1 | 2 }
  | { type: 'scroll'; dx: number; dy: number }
  | { type: 'drag-start' }
  | { type: 'drag-end' }

export function reduceTrackpadGesture(
  state: TrackpadState,
  gesture: TrackpadGesture,
): { state: TrackpadState; events: ControlEvent[] } {
  if (gesture.type === 'move') {
    const cursor = {
      x: clamp(state.cursor.x + gesture.dx * gesture.sensitivity),
      y: clamp(state.cursor.y + gesture.dy * gesture.sensitivity),
    }
    return {
      state: { ...state, cursor },
      events: [{ type: 'pointer', action: 'move', ...cursor }],
    }
  }
  if (gesture.type === 'tap')
    return {
      state,
      events: [
        {
          type: 'pointer',
          action:
            gesture.fingers === 2
              ? 'right'
              : gesture.clicks === 2
                ? 'double'
                : 'click',
          ...state.cursor,
        },
      ],
    }
  if (gesture.type === 'scroll')
    return {
      state,
      events: [
        { type: 'scroll', ...state.cursor, dx: gesture.dx, dy: gesture.dy },
      ],
    }
  if (gesture.type === 'drag-start')
    return {
      state: { ...state, phase: 'dragging' },
      events: [{ type: 'pointer', action: 'down', ...state.cursor }],
    }
  return {
    state: { ...state, phase: 'idle' },
    events: [{ type: 'pointer', action: 'up', ...state.cursor }],
  }
}

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
