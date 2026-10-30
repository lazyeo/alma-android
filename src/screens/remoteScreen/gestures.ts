import type { Point } from './controls'

const TAP_DISTANCE = 8
const TAP_DURATION = 250
const DOUBLE_TAP_DELAY = 120
const DOUBLE_TAP_DISTANCE = 24
export const GESTURE_HOLD_DELAY = 350
const TWO_FINGER_DOWN_WINDOW = 150
const TWO_FINGER_DURATION = 300

interface PointerSample {
  start: Point
  point: Point
  downAt: number
  moved: boolean
}

interface PendingTap {
  point: Point
  deadline: number
}

export interface GestureState {
  pointers: Record<number, PointerSample>
  sessionPointerIds: number[]
  sessionSamples: Record<number, PointerSample>
  firstDownAt?: number
  maxPointers: number
  multiMoved: boolean
  lastCentroid?: Point
  dragging: boolean
  pendingTap?: PendingTap
  secondTap: boolean
}

export type GestureInput =
  | {
      type: 'down' | 'move' | 'up' | 'cancel'
      id: number
      point: Point
      at: number
    }
  | { type: 'tick'; at: number }

export type GestureAction =
  | { type: 'move'; point: Point; delta: Point }
  | {
      type: 'click' | 'double' | 'right' | 'drag-start' | 'drag-end'
      point: Point
    }
  | { type: 'scroll'; point: Point; delta: Point }

export const createGestureState = (): GestureState => ({
  pointers: {},
  sessionPointerIds: [],
  sessionSamples: {},
  maxPointers: 0,
  multiMoved: false,
  dragging: false,
  secondTap: false,
})

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const centroid = (pointers: PointerSample[]) => ({
  x:
    pointers.reduce((sum, pointer) => sum + pointer.point.x, 0) /
    pointers.length,
  y:
    pointers.reduce((sum, pointer) => sum + pointer.point.y, 0) /
    pointers.length,
})

const withoutSession = (state: GestureState): GestureState => ({
  ...state,
  pointers: {},
  sessionPointerIds: [],
  sessionSamples: {},
  firstDownAt: undefined,
  maxPointers: 0,
  multiMoved: false,
  lastCentroid: undefined,
  dragging: false,
  secondTap: false,
})

export function reducePointerGesture(
  state: GestureState,
  input: GestureInput,
): { state: GestureState; actions: GestureAction[] } {
  const actions: GestureAction[] = []
  let next = state

  if (input.type === 'tick') {
    const active = Object.values(state.pointers)
    if (
      active.length === 1 &&
      state.maxPointers === 1 &&
      !active[0].moved &&
      !state.dragging &&
      state.firstDownAt !== undefined &&
      input.at - state.firstDownAt >= GESTURE_HOLD_DELAY
    ) {
      next = { ...state, dragging: true }
      actions.push({ type: 'drag-start', point: active[0].point })
    }
    if (next.pendingTap && input.at > next.pendingTap.deadline) {
      actions.push({ type: 'click', point: next.pendingTap.point })
      next = { ...next, pendingTap: undefined }
    }
    return { state: next, actions }
  }

  if (input.type === 'down') {
    const existing = Object.values(state.pointers)
    const startsSession = existing.length === 0
    const matchesPending =
      startsSession &&
      state.pendingTap !== undefined &&
      input.at <= state.pendingTap.deadline &&
      distance(input.point, state.pendingTap.point) < DOUBLE_TAP_DISTANCE
    const pointer: PointerSample = {
      start: input.point,
      point: input.point,
      downAt: input.at,
      moved: false,
    }
    const pointers = { ...state.pointers, [input.id]: pointer }
    const active = Object.values(pointers)
    next = {
      ...state,
      pointers,
      sessionPointerIds: startsSession
        ? [input.id]
        : [...state.sessionPointerIds, input.id],
      sessionSamples: startsSession
        ? { [input.id]: pointer }
        : { ...state.sessionSamples, [input.id]: pointer },
      firstDownAt: startsSession ? input.at : state.firstDownAt,
      maxPointers: Math.max(state.maxPointers, active.length),
      lastCentroid: active.length === 2 ? centroid(active) : state.lastCentroid,
      pendingTap: matchesPending ? undefined : state.pendingTap,
      secondTap: matchesPending,
    }
    return { state: next, actions }
  }

  const current = state.pointers[input.id]
  if (!current) return { state, actions }
  const updated: PointerSample = {
    ...current,
    point: input.point,
    moved:
      current.moved || distance(current.start, input.point) >= TAP_DISTANCE,
  }
  const pointers = { ...state.pointers, [input.id]: updated }
  const sessionSamples = { ...state.sessionSamples, [input.id]: updated }

  if (input.type === 'move') {
    const active = Object.values(pointers)
    if (active.length === 2) {
      const center = centroid(active)
      const previous = state.lastCentroid ?? center
      const delta = { x: center.x - previous.x, y: center.y - previous.y }
      next = {
        ...state,
        pointers,
        sessionSamples,
        multiMoved: state.multiMoved || Math.hypot(delta.x, delta.y) > 0,
        lastCentroid: center,
      }
      if (delta.x || delta.y)
        actions.push({ type: 'scroll', point: center, delta })
      return { state: next, actions }
    }
    const startsTapDrag =
      state.maxPointers === 1 && state.secondTap && updated.moved && !state.dragging
    next = {
      ...state,
      pointers,
      sessionSamples,
      dragging: state.dragging || startsTapDrag,
    }
    if (startsTapDrag)
      actions.push({ type: 'drag-start', point: current.start })
    if (state.maxPointers === 1 && (updated.moved || state.dragging)) {
      actions.push({
        type: 'move',
        point: input.point,
        delta: {
          x: input.point.x - current.point.x,
          y: input.point.y - current.point.y,
        },
      })
    }
    return { state: next, actions }
  }

  const remaining = { ...pointers }
  delete remaining[input.id]
  next = { ...state, pointers: remaining, sessionSamples }
  if (input.type === 'cancel') {
    if (state.dragging) actions.push({ type: 'drag-end', point: input.point })
    return { state: withoutSession(next), actions }
  }
  if (Object.keys(remaining).length > 0) return { state: next, actions }

  if (state.maxPointers === 2) {
    const samples = state.sessionPointerIds
      .map((id) => sessionSamples[id])
      .filter(Boolean)
    const downSpread =
      Math.max(...samples.map((sample) => sample.downAt)) -
      Math.min(...samples.map((sample) => sample.downAt))
    const duration = input.at - (state.firstDownAt ?? input.at)
    const littleMovement = samples.every((sample) => !sample.moved)
    if (
      downSpread <= TWO_FINGER_DOWN_WINDOW &&
      duration < TWO_FINGER_DURATION &&
      littleMovement &&
      !state.multiMoved
    )
      actions.push({ type: 'right', point: centroid(samples) })
    return { state: withoutSession(next), actions }
  }

  if (state.dragging) {
    actions.push({ type: 'drag-end', point: input.point })
    return { state: withoutSession(next), actions }
  }
  const duration = input.at - current.downAt
  if (!updated.moved && duration < TAP_DURATION) {
    if (state.secondTap) {
      actions.push({ type: 'double', point: input.point })
      return {
        state: withoutSession({ ...next, pendingTap: undefined }),
        actions,
      }
    }
    return {
      state: withoutSession({
        ...next,
        pendingTap: {
          point: input.point,
          deadline: input.at + DOUBLE_TAP_DELAY,
        },
      }),
      actions,
    }
  }
  return { state: withoutSession(next), actions }
}
