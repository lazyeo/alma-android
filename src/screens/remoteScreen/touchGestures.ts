// Touch gestures on the remote screen as a pure state machine.
//
// One machine serves two modes:
// - trackpad: the finger moves a local cursor with pointer acceleration. A tap
//   clicks at the cursor, a second tap double-clicks, a 350ms hold then move
//   (or tap then drag) drags.
// - pan: no desktop input. One finger pans the zoomed view.
// In both modes two fingers pinch to zoom (anchored at their centroid). Two
// fingers dragged together scroll (trackpad) or pan (pan mode). A two-finger
// tap is a right click; when zoomed, a quick second two-finger tap resets the
// zoom instead.
//
// Inputs carry their own timestamps and the caller feeds `tick` at
// `nextGestureDeadline`, so tests drive it with synthetic sequences.

import type { Point } from './viewport'

export type GestureMode = 'trackpad' | 'pan'

export interface GestureEnv {
  mode: GestureMode
  /** Whether the view is zoomed in (enables the two-finger double tap). */
  zoomed: boolean
}

export const TOUCH_SLOP = 8
export const HOLD_DELAY = 350
export const DOUBLE_TAP_DELAY = 120
const DOUBLE_TAP_DISTANCE = 24
const TWO_FINGER_DOWN_WINDOW = 150
const TWO_FINGER_TAP_DURATION = 300
export const TWO_FINGER_DOUBLE_TAP_DELAY = 250
const PINCH_SLOP = 1.5 * TOUCH_SLOP

export type GesturePhase =
  | 'idle'
  | 'pending'
  | 'moving'
  | 'holding'
  | 'dragging'
  | 'two'
  | 'scrolling'
  | 'pinching'
  | 'done'

interface Finger {
  start: Point
  point: Point
}

export interface TouchGestureState {
  phase: GesturePhase
  fingers: Record<number, Finger>
  primaryId?: number
  downAt: number
  secondDownAt: number
  /** EMA of finger speed in px/s, for trackpad acceleration. */
  velocity: number
  lastMoveAt: number
  /** This session began as the second tap of a double tap. */
  secondTap: boolean
  /** A one-finger tap waiting to learn whether a second tap follows. */
  pendingTap?: { point: Point; deadline: number }
  /** A two-finger tap waiting to learn whether a second follows (zoomed). */
  pendingTwoTap?: { point: Point; deadline: number; right: boolean }
  /** This two-finger session began as the second two-finger tap. */
  secondTwoTap: boolean
  pinchStart?: { centroid: Point; distance: number }
  lastCentroid?: Point
}

export type GestureAction =
  /** Move the cursor by this many surface px (accelerated). */
  | { type: 'cursor'; delta: Point }
  /** Mouse button down / up at the cursor; `point` is where the finger was. */
  | { type: 'press' | 'release'; point: Point }
  | { type: 'click' | 'double' | 'right'; point: Point }
  /** Scroll at the cursor by the centroid movement in surface px. */
  | { type: 'scroll'; point: Point; delta: Point }
  | {
      type: 'pinch'
      startCentroid: Point
      startDistance: number
      centroid: Point
      distance: number
    }
  | { type: 'pinch-end' }
  /** pan mode: move the view by this many surface px. */
  | { type: 'pan'; delta: Point }
  | { type: 'reset-zoom' }
  | { type: 'haptic'; kind: 'light' | 'medium' }

export type TouchGestureInput =
  | {
      type: 'down' | 'move' | 'up' | 'cancel'
      id: number
      point: Point
      at: number
    }
  | { type: 'tick'; at: number }

export const createTouchGestureState = (): TouchGestureState => ({
  phase: 'idle',
  fingers: {},
  downAt: 0,
  secondDownAt: 0,
  velocity: 0,
  lastMoveAt: 0,
  secondTap: false,
  secondTwoTap: false,
})

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y })

const centroidOf = (fingers: Finger[]) => ({
  x: fingers.reduce((sum, finger) => sum + finger.point.x, 0) / fingers.length,
  y: fingers.reduce((sum, finger) => sum + finger.point.y, 0) / fingers.length,
})

const spreadOf = (fingers: Finger[]) =>
  fingers.length >= 2 ? distance(fingers[0].point, fingers[1].point) : 0

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** Pointer acceleration: 1× below 300 px/s, rising smoothly to 2.5× at 1400. */
export function pointerGain(velocity: number) {
  const t = Math.min(1, Math.max(0, (velocity - 300) / 1100))
  return 1 + 1.5 * smoothstep(t)
}

/** Ends the touch session; pending taps survive for the next one. */
const endSession = (state: TouchGestureState): TouchGestureState => ({
  ...state,
  phase: 'idle',
  fingers: {},
  primaryId: undefined,
  velocity: 0,
  secondTap: false,
  secondTwoTap: false,
  pinchStart: undefined,
  lastCentroid: undefined,
})

/** Movement of the primary finger in moving, holding or dragging. */
function singleMove(
  state: TouchGestureState,
  env: GestureEnv,
  from: Point,
  to: Point,
  at: number,
): { state: TouchGestureState; actions: GestureAction[] } {
  const delta = sub(to, from)
  if (env.mode === 'pan')
    return {
      state,
      actions: delta.x || delta.y ? [{ type: 'pan', delta }] : [],
    }
  const dt = Math.max(1, at - state.lastMoveAt)
  const speed = (Math.hypot(delta.x, delta.y) / dt) * 1000
  const velocity = state.velocity ? 0.5 * state.velocity + 0.5 * speed : speed
  const gain = pointerGain(velocity)
  return {
    state: { ...state, velocity, lastMoveAt: at },
    actions:
      delta.x || delta.y
        ? [{ type: 'cursor', delta: { x: delta.x * gain, y: delta.y * gain } }]
        : [],
  }
}

export function reduceTouchGesture(
  state: TouchGestureState,
  input: TouchGestureInput,
  env: GestureEnv,
): { state: TouchGestureState; actions: GestureAction[] } {
  const actions: GestureAction[] = []

  if (input.type === 'tick') {
    let next = state
    const primary =
      next.primaryId !== undefined ? next.fingers[next.primaryId] : undefined
    if (
      next.phase === 'pending' &&
      primary &&
      env.mode !== 'pan' &&
      input.at - next.downAt >= HOLD_DELAY
    ) {
      actions.push({ type: 'haptic', kind: 'medium' })
      next = { ...next, phase: 'holding' }
    }
    if (next.pendingTap && input.at > next.pendingTap.deadline) {
      actions.push({ type: 'click', point: next.pendingTap.point })
      next = { ...next, pendingTap: undefined }
    }
    if (next.pendingTwoTap && input.at > next.pendingTwoTap.deadline) {
      if (next.pendingTwoTap.right)
        actions.push(
          { type: 'haptic', kind: 'light' },
          { type: 'right', point: next.pendingTwoTap.point },
        )
      next = { ...next, pendingTwoTap: undefined }
    }
    return { state: next, actions }
  }

  if (input.type === 'down') {
    const count = Object.keys(state.fingers).length
    const finger: Finger = { start: input.point, point: input.point }
    const fingers = { ...state.fingers, [input.id]: finger }
    if (count === 0) {
      let next = state
      const matches =
        env.mode !== 'pan' &&
        next.pendingTap !== undefined &&
        input.at <= next.pendingTap.deadline &&
        distance(input.point, next.pendingTap.point) < DOUBLE_TAP_DISTANCE
      // A pending tap that this touch does not continue clicks right away.
      if (next.pendingTap && !matches) {
        actions.push({ type: 'click', point: next.pendingTap.point })
      }
      next = {
        ...endSession(next),
        phase: 'pending',
        fingers,
        primaryId: input.id,
        downAt: input.at,
        lastMoveAt: input.at,
        secondTap: matches,
        pendingTap: undefined,
      }
      return { state: next, actions }
    }
    if (
      count === 1 &&
      (state.phase === 'pending' ||
        state.phase === 'moving' ||
        state.phase === 'holding')
    ) {
      const list = Object.values(fingers)
      const continuesTwoTap =
        state.pendingTwoTap !== undefined &&
        input.at <= state.pendingTwoTap.deadline
      let pendingTwoTap = state.pendingTwoTap
      // A waiting two-finger tap that this one does not continue fires now.
      if (pendingTwoTap && !continuesTwoTap) {
        if (pendingTwoTap.right)
          actions.push(
            { type: 'haptic', kind: 'light' },
            { type: 'right', point: pendingTwoTap.point },
          )
        pendingTwoTap = undefined
      }
      const centroid = centroidOf(list)
      return {
        state: {
          ...state,
          phase: 'two',
          fingers,
          secondDownAt: input.at,
          secondTap: false,
          secondTwoTap: continuesTwoTap,
          pendingTwoTap: continuesTwoTap ? undefined : pendingTwoTap,
          pinchStart: { centroid, distance: spreadOf(list) },
          lastCentroid: centroid,
        },
        actions,
      }
    }
    // A finger added during a drag is ignored; a third finger ends the gesture.
    if (state.phase === 'dragging')
      return { state: { ...state, fingers }, actions }
    if (state.phase === 'pinching') actions.push({ type: 'pinch-end' })
    return { state: { ...state, phase: 'done', fingers }, actions }
  }

  const current = state.fingers[input.id]
  if (!current) return { state, actions }
  const updated: Finger = { ...current, point: input.point }
  const fingers = { ...state.fingers, [input.id]: updated }
  const isPrimary = input.id === state.primaryId

  if (input.type === 'move') {
    let next: TouchGestureState = { ...state, fingers }
    switch (state.phase) {
      case 'pending': {
        if (!isPrimary || distance(current.start, input.point) < TOUCH_SLOP)
          return { state: next, actions }
        if (state.secondTap && env.mode !== 'pan') {
          next = { ...next, phase: 'dragging' }
          actions.push({ type: 'press', point: current.start })
        } else next = { ...next, phase: 'moving' }
        const result = singleMove(
          next,
          env,
          current.start,
          input.point,
          input.at,
        )
        return { state: result.state, actions: [...actions, ...result.actions] }
      }
      case 'holding': {
        if (!isPrimary || distance(current.start, input.point) < TOUCH_SLOP)
          return { state: next, actions }
        next = { ...next, phase: 'dragging' }
        actions.push({ type: 'press', point: current.start })
        const result = singleMove(
          next,
          env,
          current.start,
          input.point,
          input.at,
        )
        return { state: result.state, actions: [...actions, ...result.actions] }
      }
      case 'moving':
      case 'dragging': {
        if (!isPrimary) return { state: next, actions }
        return singleMove(next, env, current.point, input.point, input.at)
      }
      case 'two': {
        const list = Object.values(fingers)
        if (list.length !== 2 || !state.pinchStart)
          return { state: next, actions }
        const centroid = centroidOf(list)
        const spread = spreadOf(list)
        const moved = distance(centroid, state.pinchStart.centroid)
        const stretched = Math.abs(spread - state.pinchStart.distance)
        if (
          (stretched > PINCH_SLOP && stretched > moved) ||
          (env.mode === 'pan' && moved > TOUCH_SLOP)
        ) {
          next = { ...next, phase: 'pinching' }
          actions.push({
            type: 'pinch',
            startCentroid: state.pinchStart.centroid,
            startDistance: state.pinchStart.distance,
            centroid,
            distance: spread,
          })
        } else if (moved > TOUCH_SLOP) {
          next = { ...next, phase: 'scrolling', lastCentroid: centroid }
          actions.push({
            type: 'scroll',
            point: centroid,
            delta: sub(centroid, state.pinchStart.centroid),
          })
        }
        return { state: next, actions }
      }
      case 'scrolling': {
        const list = Object.values(fingers)
        if (list.length !== 2) return { state: next, actions }
        const centroid = centroidOf(list)
        const delta = sub(centroid, state.lastCentroid ?? centroid)
        next = { ...next, lastCentroid: centroid }
        if (delta.x || delta.y)
          actions.push({ type: 'scroll', point: centroid, delta })
        return { state: next, actions }
      }
      case 'pinching': {
        const list = Object.values(fingers)
        if (list.length !== 2 || !state.pinchStart)
          return { state: next, actions }
        actions.push({
          type: 'pinch',
          startCentroid: state.pinchStart.centroid,
          startDistance: state.pinchStart.distance,
          centroid: centroidOf(list),
          distance: spreadOf(list),
        })
        return { state: next, actions }
      }
      default:
        return { state: next, actions }
    }
  }

  // up or cancel
  const remaining = { ...fingers }
  delete remaining[input.id]
  const left = Object.keys(remaining).length

  if (input.type === 'cancel') {
    if (state.phase === 'dragging')
      actions.push({ type: 'release', point: updated.point })
    if (state.phase === 'pinching') actions.push({ type: 'pinch-end' })
    return { state: endSession(state), actions }
  }

  switch (state.phase) {
    case 'pending': {
      if (!isPrimary) break
      if (env.mode === 'pan') return { state: endSession(state), actions }
      if (state.secondTap) {
        actions.push({ type: 'double', point: input.point })
        return { state: endSession(state), actions }
      }
      return {
        state: {
          ...endSession(state),
          pendingTap: {
            point: input.point,
            deadline: input.at + DOUBLE_TAP_DELAY,
          },
        },
        actions,
      }
    }
    case 'holding': {
      if (!isPrimary) break
      actions.push({ type: 'click', point: input.point })
      return { state: endSession(state), actions }
    }
    case 'moving':
    case 'dragging': {
      if (!isPrimary)
        return { state: { ...state, fingers: remaining }, actions }
      if (state.phase === 'dragging')
        actions.push({ type: 'release', point: input.point })
      if (left)
        return {
          state: { ...state, phase: 'done', fingers: remaining },
          actions,
        }
      return { state: endSession(state), actions }
    }
    case 'two': {
      if (left) return { state: { ...state, fingers: remaining }, actions }
      const quick =
        state.secondDownAt - state.downAt <= TWO_FINGER_DOWN_WINDOW &&
        input.at - state.downAt < TWO_FINGER_TAP_DURATION
      if (!quick) return { state: endSession(state), actions }
      const point = state.lastCentroid ?? input.point
      if (state.secondTwoTap) {
        actions.push({ type: 'reset-zoom' })
        return {
          state: { ...endSession(state), pendingTwoTap: undefined },
          actions,
        }
      }
      const right = env.mode !== 'pan'
      if (env.zoomed)
        return {
          state: {
            ...endSession(state),
            pendingTwoTap: {
              point,
              right,
              deadline: input.at + TWO_FINGER_DOUBLE_TAP_DELAY,
            },
          },
          actions,
        }
      if (right)
        actions.push(
          { type: 'haptic', kind: 'light' },
          { type: 'right', point },
        )
      return { state: endSession(state), actions }
    }
    case 'pinching': {
      actions.push({ type: 'pinch-end' })
      if (left)
        return {
          state: { ...state, phase: 'done', fingers: remaining },
          actions,
        }
      return { state: endSession(state), actions }
    }
    default:
      break
  }
  if (left)
    return { state: { ...state, phase: 'done', fingers: remaining }, actions }
  return { state: endSession(state), actions }
}

/** When the caller should next feed a `tick`, if anything is waiting. */
export function nextGestureDeadline(
  state: TouchGestureState,
  env: GestureEnv,
): number | undefined {
  const deadlines = [
    state.pendingTap ? state.pendingTap.deadline + 1 : undefined,
    state.pendingTwoTap ? state.pendingTwoTap.deadline + 1 : undefined,
    state.phase === 'pending' && env.mode !== 'pan'
      ? state.downAt + HOLD_DELAY
      : undefined,
  ].filter((value): value is number => value !== undefined)
  return deadlines.length ? Math.min(...deadlines) : undefined
}
