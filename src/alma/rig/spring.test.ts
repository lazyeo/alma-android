import { describe, expect, it } from 'vitest'
import { Spring, stepSpring } from './spring'

describe('stepSpring', () => {
  it('converges on the target without overshoot when critically damped', () => {
    let state = { value: 0, velocity: 0 }
    let peak = 0
    for (let i = 0; i < 60; i++) {
      state = stepSpring(state, 1, { response: 0.35, damping: 1 }, 1 / 60)
      peak = Math.max(peak, state.value)
    }
    expect(state.value).toBeCloseTo(1, 3)
    expect(peak).toBeLessThanOrEqual(1.0005)
  })

  it('settles within about its response time', () => {
    let state = { value: 0, velocity: 0 }
    for (let i = 0; i < 24; i++)
      state = stepSpring(state, 1, { response: 0.35, damping: 1 }, 1 / 60)
    // 0.4 s in: within a few percent
    expect(state.value).toBeGreaterThan(0.97)
  })

  it('overshoots when underdamped', () => {
    let state = { value: 0, velocity: 0 }
    let peak = 0
    for (let i = 0; i < 60; i++) {
      state = stepSpring(state, 1, { response: 0.25, damping: 0.5 }, 1 / 60)
      peak = Math.max(peak, state.value)
    }
    expect(peak).toBeGreaterThan(1.05)
  })

  it('stays stable through one long frame of a stiff spring', () => {
    const state = stepSpring(
      { value: 1, velocity: 0 },
      0,
      { response: 0.05, damping: 1 },
      0.5,
    )
    expect(Number.isFinite(state.value)).toBe(true)
    expect(Math.abs(state.value)).toBeLessThan(0.01)
  })

  it('ignores zero and negative time', () => {
    const state = { value: 0.3, velocity: 2 }
    expect(stepSpring(state, 1, { response: 0.3, damping: 1 }, 0)).toBe(state)
    expect(stepSpring(state, 1, { response: 0.3, damping: 1 }, -1)).toBe(state)
  })
})

describe('Spring', () => {
  it('follows a moved target and snaps on request', () => {
    const spring = new Spring(0, 0.2)
    spring.target = 2
    for (let i = 0; i < 120; i++) spring.step(1 / 60)
    expect(spring.value).toBeCloseTo(2, 3)
    spring.target = -1
    spring.snap()
    expect(spring.value).toBe(-1)
    expect(spring.velocity).toBe(0)
  })
})
