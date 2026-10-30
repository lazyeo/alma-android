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
  it('defers a one-finger tap only briefly, then emits one click', () => {
    const actions = run([down(1, 20, 30, 0), up(1, 22, 31, 80), tick(201)])
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

  it('starts a 350ms held selection drag, sends every move, and releases', () => {
    const actions = run([
      down(1, 10, 10, 0),
      tick(350),
      move(1, 20, 15, 380),
      move(1, 28, 20, 410),
      up(1, 28, 20, 440),
    ])
    expect(actions).toEqual([
      { type: 'drag-start', point: { x: 10, y: 10 } },
      {
        type: 'move',
        point: { x: 20, y: 15 },
        delta: { x: 10, y: 5 },
      },
      {
        type: 'move',
        point: { x: 28, y: 20 },
        delta: { x: 8, y: 5 },
      },
      { type: 'drag-end', point: { x: 28, y: 20 } },
    ])
  })

  it('starts selection on double-tap-and-hold before drag moves', () => {
    const actions = run([
      down(1, 10, 10, 0),
      up(1, 10, 10, 60),
      down(2, 12, 11, 120),
      move(2, 26, 18, 180),
      move(2, 34, 22, 210),
      up(2, 34, 22, 240),
    ])
    expect(actions).toEqual([
      { type: 'drag-start', point: { x: 12, y: 11 } },
      {
        type: 'move',
        point: { x: 26, y: 18 },
        delta: { x: 14, y: 7 },
      },
      {
        type: 'move',
        point: { x: 34, y: 22 },
        delta: { x: 8, y: 4 },
      },
      { type: 'drag-end', point: { x: 34, y: 22 } },
    ])
  })
})
