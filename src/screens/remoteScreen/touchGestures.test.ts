import { describe, expect, it } from 'vitest'
import {
  createTouchGestureState,
  DOUBLE_TAP_DELAY,
  HOLD_DELAY,
  nextGestureDeadline,
  pointerGain,
  reduceTouchGesture,
  TWO_FINGER_DOUBLE_TAP_DELAY,
  type GestureAction,
  type GestureEnv,
  type TouchGestureInput,
  type TouchGestureState,
} from './touchGestures'

type Step = TouchGestureInput | { type: 'wait'; until: number }

const DIRECT: GestureEnv = { mode: 'direct', zoomed: false }
const TRACKPAD: GestureEnv = { mode: 'trackpad', zoomed: false }
const PAN: GestureEnv = { mode: 'pan', zoomed: true }

/**
 * Feeds inputs and, like the component's timer, a `tick` at every deadline
 * that passes before the next input (faked time).
 */
const run = (steps: Step[], env: GestureEnv) => {
  let state: TouchGestureState = createTouchGestureState()
  const actions: GestureAction[] = []
  const feed = (input: TouchGestureInput) => {
    const result = reduceTouchGesture(state, input, env)
    state = result.state
    actions.push(...result.actions)
  }
  const advanceTo = (at: number) => {
    for (;;) {
      const deadline = nextGestureDeadline(state, env)
      if (deadline === undefined || deadline > at) return
      feed({ type: 'tick', at: deadline })
    }
  }
  for (const step of steps) {
    if (step.type === 'wait') {
      advanceTo(step.until)
      continue
    }
    if (step.type !== 'tick') advanceTo(step.at)
    feed(step)
  }
  return { actions, state }
}

const down = (id: number, x: number, y: number, at: number): Step => ({
  type: 'down',
  id,
  point: { x, y },
  at,
})
const move = (id: number, x: number, y: number, at: number): Step => ({
  type: 'move',
  id,
  point: { x, y },
  at,
})
const up = (id: number, x: number, y: number, at: number): Step => ({
  type: 'up',
  id,
  point: { x, y },
  at,
})
const cancel = (id: number, x: number, y: number, at: number): Step => ({
  type: 'cancel',
  id,
  point: { x, y },
  at,
})
const wait = (until: number): Step => ({ type: 'wait', until })
const without = (actions: GestureAction[], type: GestureAction['type']) =>
  actions.filter((action) => action.type !== type)

describe('direct mode', () => {
  it('clicks a tap once the double-tap window has passed', () => {
    const { actions } = run(
      [down(1, 20, 30, 0), up(1, 22, 31, 80), wait(1000)],
      DIRECT,
    )
    expect(actions).toEqual([{ type: 'click', point: { x: 22, y: 31 } }])
  })

  it('does not click before the double-tap window ends', () => {
    const { actions, state } = run(
      [down(1, 20, 30, 0), up(1, 22, 31, 80), wait(80 + DOUBLE_TAP_DELAY)],
      DIRECT,
    )
    expect(actions).toEqual([])
    expect(nextGestureDeadline(state, DIRECT)).toBe(80 + DOUBLE_TAP_DELAY + 1)
  })

  it('turns a second tap into one double click', () => {
    const { actions } = run(
      [
        down(1, 20, 30, 0),
        up(1, 20, 30, 90),
        down(2, 22, 31, 180),
        up(2, 22, 31, 250),
        wait(900),
      ],
      DIRECT,
    )
    expect(actions).toEqual([{ type: 'double', point: { x: 22, y: 31 } }])
  })

  it('clicks the first tap at once when the next touch lands far away', () => {
    const { actions } = run(
      [
        down(1, 20, 30, 0),
        up(1, 20, 30, 50),
        down(2, 200, 300, 100),
        up(2, 200, 300, 140),
        wait(900),
      ],
      DIRECT,
    )
    expect(actions).toEqual([
      { type: 'click', point: { x: 20, y: 30 } },
      { type: 'click', point: { x: 200, y: 300 } },
    ])
  })

  it('hovers while a finger moves and never clicks', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        move(1, 13, 12, 20),
        move(1, 30, 20, 80),
        move(1, 40, 25, 120),
        up(1, 40, 25, 140),
        wait(900),
      ],
      DIRECT,
    )
    // The sub-slop move is swallowed.
    expect(actions).toEqual([
      { type: 'hover', point: { x: 30, y: 20 } },
      { type: 'hover', point: { x: 40, y: 25 } },
    ])
  })

  it('presses after a 350ms hold, drags and releases', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        wait(HOLD_DELAY),
        move(1, 20, 15, 380),
        move(1, 28, 20, 410),
        up(1, 28, 20, 440),
      ],
      DIRECT,
    )
    expect(actions).toEqual([
      { type: 'haptic', kind: 'medium' },
      { type: 'press', point: { x: 10, y: 10 } },
      { type: 'hover', point: { x: 20, y: 15 } },
      { type: 'hover', point: { x: 28, y: 20 } },
      { type: 'release', point: { x: 28, y: 20 } },
    ])
  })

  it('a held finger that never moves is a long press, not a click', () => {
    const { actions } = run(
      [down(1, 10, 10, 0), up(1, 10, 10, 600), wait(2000)],
      DIRECT,
    )
    expect(without(actions, 'haptic')).toEqual([
      { type: 'press', point: { x: 10, y: 10 } },
      { type: 'release', point: { x: 10, y: 10 } },
    ])
  })

  it('tap then drag selects from the second touch', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        up(1, 10, 10, 60),
        down(2, 12, 11, 120),
        move(2, 26, 18, 180),
        move(2, 34, 22, 210),
        up(2, 34, 22, 240),
      ],
      DIRECT,
    )
    expect(actions).toEqual([
      { type: 'press', point: { x: 12, y: 11 } },
      { type: 'hover', point: { x: 26, y: 18 } },
      { type: 'hover', point: { x: 34, y: 22 } },
      { type: 'release', point: { x: 34, y: 22 } },
    ])
  })

  it('releases a drag when the touch is cancelled', () => {
    const { actions, state } = run(
      [
        down(1, 10, 10, 0),
        wait(HOLD_DELAY),
        move(1, 40, 10, 400),
        cancel(1, 40, 10, 420),
      ],
      DIRECT,
    )
    expect(actions.at(-1)).toEqual({ type: 'release', point: { x: 40, y: 10 } })
    expect(state.phase).toBe('idle')
  })

  it('ignores a second finger during a drag', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        wait(HOLD_DELAY),
        down(2, 100, 100, 400),
        move(2, 150, 150, 420),
        move(1, 30, 10, 430),
        up(2, 150, 150, 440),
        up(1, 30, 10, 450),
      ],
      DIRECT,
    )
    expect(without(actions, 'haptic')).toEqual([
      { type: 'press', point: { x: 10, y: 10 } },
      { type: 'hover', point: { x: 30, y: 10 } },
      { type: 'release', point: { x: 30, y: 10 } },
    ])
  })
})

describe('two fingers', () => {
  it('right-clicks a quick two-finger tap at the centroid', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 70),
        up(1, 11, 11, 150),
        up(2, 31, 11, 190),
        wait(900),
      ],
      DIRECT,
    )
    expect(actions).toEqual([
      { type: 'haptic', kind: 'light' },
      { type: 'right', point: { x: 20, y: 10 } },
    ])
  })

  it('is not a right click when the fingers stay down too long', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 20),
        up(1, 10, 10, 400),
        up(2, 30, 10, 410),
        wait(900),
      ],
      DIRECT,
    )
    expect(actions).toEqual([])
  })

  it('is not a right click when the second finger lands late', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 200),
        up(1, 10, 10, 250),
        up(2, 30, 10, 260),
        wait(900),
      ],
      DIRECT,
    )
    expect(actions).toEqual([])
  })

  it('scrolls with the centroid once it moves past the slop', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 30),
        move(1, 10, 20, 60), // centroid +5: below the slop
        move(2, 30, 20, 70), // centroid +10: scrolling
        move(1, 10, 26, 90),
        move(2, 30, 26, 100),
        up(1, 10, 26, 120),
        up(2, 30, 26, 130),
        wait(900),
      ],
      TRACKPAD,
    )
    expect(actions).toEqual([
      { type: 'scroll', point: { x: 20, y: 20 }, delta: { x: 0, y: 10 } },
      { type: 'scroll', point: { x: 20, y: 23 }, delta: { x: 0, y: 3 } },
      { type: 'scroll', point: { x: 20, y: 26 }, delta: { x: 0, y: 3 } },
    ])
  })

  it('pinches when the spread changes more than the centroid moves', () => {
    const { actions, state } = run(
      [
        down(1, 100, 100, 0),
        down(2, 200, 100, 10),
        move(1, 80, 100, 40),
        move(2, 240, 100, 50),
        up(1, 80, 100, 400),
        up(2, 240, 100, 410),
      ],
      DIRECT,
    )
    expect(actions).toEqual([
      {
        type: 'pinch',
        startCentroid: { x: 150, y: 100 },
        startDistance: 100,
        centroid: { x: 140, y: 100 },
        distance: 120,
      },
      {
        type: 'pinch',
        startCentroid: { x: 150, y: 100 },
        startDistance: 100,
        centroid: { x: 160, y: 100 },
        distance: 160,
      },
      { type: 'pinch-end' },
    ])
    expect(state.phase).toBe('idle')
  })

  it('stays a pinch even if the fingers later move together', () => {
    const { actions } = run(
      [
        down(1, 100, 100, 0),
        down(2, 200, 100, 10),
        move(2, 230, 100, 40),
        move(1, 150, 140, 60),
        move(2, 280, 140, 70),
      ],
      DIRECT,
    )
    expect(actions.map((action) => action.type)).toEqual([
      'pinch',
      'pinch',
      'pinch',
    ])
  })

  it('ends the gesture when a third finger lands', () => {
    const { actions, state } = run(
      [
        down(1, 100, 100, 0),
        down(2, 200, 100, 10),
        move(2, 240, 100, 40),
        down(3, 150, 200, 60),
        move(1, 50, 100, 80),
      ],
      DIRECT,
    )
    expect(actions.map((action) => action.type)).toEqual(['pinch', 'pinch-end'])
    expect(state.phase).toBe('done')
  })

  it('waits for a second two-finger tap when zoomed, then resets the zoom', () => {
    const zoomed = { ...DIRECT, zoomed: true }
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 20),
        up(1, 10, 10, 80),
        up(2, 30, 10, 90),
        down(1, 10, 10, 200),
        down(2, 30, 10, 210),
        up(1, 10, 10, 260),
        up(2, 30, 10, 270),
        wait(2000),
      ],
      zoomed,
    )
    expect(actions).toEqual([{ type: 'reset-zoom' }])
  })

  it('right-clicks a single two-finger tap when zoomed after the wait', () => {
    const zoomed = { ...TRACKPAD, zoomed: true }
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 20),
        up(1, 10, 10, 80),
        up(2, 30, 10, 90),
        wait(90 + TWO_FINGER_DOUBLE_TAP_DELAY),
      ],
      zoomed,
    )
    expect(actions).toEqual([])
    const later = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 20),
        up(1, 10, 10, 80),
        up(2, 30, 10, 90),
        wait(2000),
      ],
      zoomed,
    )
    expect(later.actions).toEqual([
      { type: 'haptic', kind: 'light' },
      { type: 'right', point: { x: 20, y: 10 } },
    ])
  })
})

describe('trackpad mode', () => {
  it('moves the cursor by the finger delta at slow speed', () => {
    const { actions } = run(
      // 10px per 100ms is 100 px/s: no acceleration.
      [
        down(1, 100, 100, 0),
        move(1, 110, 100, 100),
        move(1, 120, 100, 200),
        up(1, 120, 100, 210),
        wait(900),
      ],
      TRACKPAD,
    )
    expect(actions).toEqual([
      { type: 'cursor', delta: { x: 10, y: 0 } },
      { type: 'cursor', delta: { x: 10, y: 0 } },
    ])
  })

  it('accelerates fast movement up to 2.5×', () => {
    const { actions } = run(
      // 40px per 10ms is 4000 px/s.
      [
        down(1, 0, 0, 0),
        move(1, 40, 0, 10),
        move(1, 80, 0, 20),
        move(1, 120, 0, 30),
      ],
      TRACKPAD,
    )
    const deltas = actions.map((action) =>
      action.type === 'cursor' ? action.delta.x : 0,
    )
    expect(deltas).toEqual([100, 100, 100])
  })

  it('has a smooth gain curve', () => {
    expect(pointerGain(0)).toBe(1)
    expect(pointerGain(300)).toBe(1)
    expect(pointerGain(850)).toBeCloseTo(1.75)
    expect(pointerGain(1400)).toBe(2.5)
    expect(pointerGain(9000)).toBe(2.5)
    expect(pointerGain(600)).toBeGreaterThan(1)
    expect(pointerGain(600)).toBeLessThan(pointerGain(800))
  })

  it('clicks at the cursor on a tap', () => {
    const { actions } = run(
      [down(1, 50, 50, 0), up(1, 50, 50, 60), wait(900)],
      TRACKPAD,
    )
    expect(actions).toEqual([{ type: 'click', point: { x: 50, y: 50 } }])
  })

  it('a hold then release is a click with a haptic, not a drag', () => {
    const { actions } = run(
      [down(1, 50, 50, 0), wait(400), up(1, 51, 50, 500), wait(900)],
      TRACKPAD,
    )
    expect(actions).toEqual([
      { type: 'haptic', kind: 'medium' },
      { type: 'click', point: { x: 51, y: 50 } },
    ])
  })

  it('hold then move drags at the cursor', () => {
    const { actions } = run(
      [
        down(1, 50, 50, 0),
        wait(400),
        move(1, 54, 50, 420),
        move(1, 70, 50, 520),
        move(1, 80, 50, 620),
        up(1, 80, 50, 640),
      ],
      TRACKPAD,
    )
    expect(without(actions, 'haptic')).toEqual([
      { type: 'press', point: { x: 50, y: 50 } },
      { type: 'cursor', delta: { x: 20, y: 0 } },
      { type: 'cursor', delta: { x: 10, y: 0 } },
      { type: 'release', point: { x: 80, y: 50 } },
    ])
  })

  it('a quick move is cursor movement, never a drag', () => {
    const { actions } = run(
      [
        down(1, 50, 50, 0),
        move(1, 70, 50, 100),
        wait(800),
        move(1, 80, 50, 900),
        up(1, 80, 50, 950),
        wait(2000),
      ],
      TRACKPAD,
    )
    expect(actions.map((action) => action.type)).toEqual(['cursor', 'cursor'])
  })

  it('double-taps at the cursor', () => {
    const { actions } = run(
      [
        down(1, 50, 50, 0),
        up(1, 50, 50, 50),
        down(2, 55, 52, 120),
        up(2, 55, 52, 170),
        wait(900),
      ],
      TRACKPAD,
    )
    expect(actions).toEqual([{ type: 'double', point: { x: 55, y: 52 } }])
  })
})

describe('pan mode', () => {
  it('pans with one finger and sends nothing else', () => {
    const { actions } = run(
      [
        down(1, 100, 100, 0),
        move(1, 120, 90, 50),
        move(1, 130, 80, 100),
        up(1, 130, 80, 120),
        wait(2000),
      ],
      PAN,
    )
    expect(actions).toEqual([
      { type: 'pan', delta: { x: 20, y: -10 } },
      { type: 'pan', delta: { x: 10, y: -10 } },
    ])
  })

  it('never clicks, holds or right-clicks', () => {
    const { actions } = run(
      [
        down(1, 100, 100, 0),
        up(1, 100, 100, 50),
        down(1, 100, 100, 100),
        wait(1000),
        up(1, 100, 100, 1000),
        down(1, 10, 10, 1500),
        down(2, 30, 10, 1510),
        up(1, 10, 10, 1550),
        up(2, 30, 10, 1560),
        wait(3000),
      ],
      PAN,
    )
    expect(actions).toEqual([])
  })

  it('two fingers moving together pan through the pinch', () => {
    const { actions } = run(
      [
        down(1, 100, 100, 0),
        down(2, 200, 100, 10),
        move(1, 100, 130, 40),
        move(2, 200, 130, 50),
      ],
      PAN,
    )
    expect(actions.map((action) => action.type)).toEqual(['pinch', 'pinch'])
  })

  it('still resets the zoom on a two-finger double tap', () => {
    const { actions } = run(
      [
        down(1, 10, 10, 0),
        down(2, 30, 10, 20),
        up(1, 10, 10, 80),
        up(2, 30, 10, 90),
        down(1, 10, 10, 200),
        down(2, 30, 10, 210),
        up(1, 10, 10, 260),
        up(2, 30, 10, 270),
      ],
      PAN,
    )
    expect(actions).toEqual([{ type: 'reset-zoom' }])
  })
})

describe('nextGestureDeadline', () => {
  it('schedules the hold only while a single finger is pending', () => {
    let state = createTouchGestureState()
    expect(nextGestureDeadline(state, DIRECT)).toBeUndefined()
    state = reduceTouchGesture(
      state,
      { type: 'down', id: 1, point: { x: 0, y: 0 }, at: 10 },
      DIRECT,
    ).state
    expect(nextGestureDeadline(state, DIRECT)).toBe(10 + HOLD_DELAY)
    expect(nextGestureDeadline(state, PAN)).toBeUndefined()
    state = reduceTouchGesture(
      state,
      { type: 'move', id: 1, point: { x: 30, y: 0 }, at: 20 },
      DIRECT,
    ).state
    expect(nextGestureDeadline(state, DIRECT)).toBeUndefined()
  })
})
