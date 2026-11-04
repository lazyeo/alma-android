import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BLINK_CLOSED_S,
  blinkShut,
  nextBlinkGap,
  startBlinkScheduler,
} from './blink'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('nextBlinkGap', () => {
  it('stays within 3–7 seconds', () => {
    expect(nextBlinkGap(() => 0)).toBe(3000)
    expect(nextBlinkGap(() => 0.9999)).toBeLessThan(7000)
    expect(nextBlinkGap(() => 0.5)).toBe(5000)
  })
})

describe('startBlinkScheduler', () => {
  it('blinks after the randomised gap, then keeps going', () => {
    const onBlink = vi.fn()
    // first gap 3 s, then the double roll, then a ~7 s gap; never a double
    const values = [0, 0.5, 0.99, 0.5, 0.99, 0.5]
    let i = 0
    const stop = startBlinkScheduler(onBlink, {
      random: () => values[i++ % values.length],
      doubleChance: 0,
    })
    vi.advanceTimersByTime(2999)
    expect(onBlink).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onBlink).toHaveBeenCalledTimes(1)
    expect(onBlink).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(7000)
    expect(onBlink).toHaveBeenCalledTimes(2)
    stop()
  })

  it('sometimes blinks twice in a row', () => {
    const onBlink = vi.fn()
    const stop = startBlinkScheduler(onBlink, {
      random: () => 0.1,
      doubleChance: 0.2,
    })
    vi.advanceTimersByTime(3400)
    expect(onBlink).toHaveBeenCalledWith(true)
    stop()
  })

  it('stops cleanly', () => {
    const onBlink = vi.fn()
    const stop = startBlinkScheduler(onBlink, { random: () => 0 })
    stop()
    vi.advanceTimersByTime(20_000)
    expect(onBlink).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('blinkShut', () => {
  it('is shut only at the start of each blink', () => {
    expect(blinkShut([10], 9.99)).toBe(false)
    expect(blinkShut([10], 10)).toBe(true)
    expect(blinkShut([10], 10 + BLINK_CLOSED_S - 0.001)).toBe(true)
    expect(blinkShut([10], 10 + BLINK_CLOSED_S)).toBe(false)
    expect(blinkShut([10, 10.3], 10.31)).toBe(true)
  })
})
