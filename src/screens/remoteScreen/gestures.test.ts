import { describe, expect, it } from 'vitest'
import {
  createGestureState,
  reducePointerGesture,
  type GestureAction,
  type GestureInput,
} from './gestures'

const run = (inputs: GestureInput[]) => {
  let state = createGestureState()
  const actions: GestureAction[] = []
  for (const input of inputs) {
    const result = reducePointerGesture(state, input)
    state = result.state
    actions.push(...result.actions)
  }
  return actions
}

const down = (id: number, x: number, y: number, at: number): GestureInput => ({
  type: 'down',
  id,
  point: { x, y },
  at,
})
const move = (id: number, x: number, y: number, at: number): GestureInput => ({
  type: 'move',
  id,
  point: { x, y },
  at,
})
const up = (id: number, x: number, y: number, at: number): GestureInput => ({
  type: 'up',
  id,
  point: { x, y },
  at,
})
const tick = (at: number): GestureInput => ({ type: 'tick', at })

describe('reducePointerGesture', () => {
  it('defers a one-finger tap, then emits one click', () => {
    const actions = run([down(1, 20, 30, 0), up(1, 22, 31, 120), tick(371)])
    expect(actions).toEqual([{ type: 'click', point: { x: 22, y: 31 } }])
  })

  it('turns a second tap into a double click without a single click', () => {
    const actions = run([
      down(1, 20, 30, 0),
      up(1, 20, 30, 90),
      down(2, 22, 31, 180),
      up(2, 22, 31, 250),
      tick(600),
    ])
    expect(actions).toEqual([{ type: 'double', point: { x: 22, y: 31 } }])
  })

  it('moves during a one-finger drag and never clicks', () => {
    const actions = run([
      down(1, 10, 10, 0),
      move(1, 30, 20, 80),
      up(1, 40, 25, 140),
      tick(500),
    ])
    expect(actions).toEqual([
      {
        type: 'move',
        point: { x: 30, y: 20 },
        delta: { x: 20, y: 10 },
      },
    ])
  })

  it('emits right click only for a two-finger tap', () => {
    const actions = run([
      down(1, 10, 10, 0),
      down(2, 30, 10, 70),
      up(1, 11, 11, 150),
      up(2, 31, 11, 190),
      tick(500),
    ])
    expect(actions).toEqual([{ type: 'right', point: { x: 21, y: 11 } }])
  })

  it('turns a two-finger drag into scrolling', () => {
    const actions = run([
      down(1, 10, 10, 0),
      down(2, 30, 10, 30),
      move(1, 10, 24, 80),
      move(2, 30, 24, 90),
      up(1, 10, 24, 120),
      up(2, 30, 24, 130),
    ])
    expect(actions).toEqual([
      { type: 'scroll', point: { x: 20, y: 17 }, delta: { x: 0, y: 7 } },
      { type: 'scroll', point: { x: 20, y: 24 }, delta: { x: 0, y: 7 } },
    ])
  })

  it('starts a held drag, moves it, and releases the mouse', () => {
    const actions = run([
      down(1, 10, 10, 0),
      tick(400),
      move(1, 28, 20, 450),
      up(1, 28, 20, 500),
    ])
    expect(actions).toEqual([
      { type: 'drag-start', point: { x: 10, y: 10 } },
      {
        type: 'move',
        point: { x: 28, y: 20 },
        delta: { x: 18, y: 10 },
      },
      { type: 'drag-end', point: { x: 28, y: 20 } },
    ])
  })
})
