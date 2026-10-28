import { afterEach, expect, it, vi } from 'vitest'
import { createLongPress } from './longPress'
afterEach(() => vi.useRealTimers())
it('fires at exactly 450ms and tolerates exactly 8px', () => {
  vi.useFakeTimers()
  const action = vi.fn(),
    press = createLongPress(action)
  press.start(0, 0)
  press.move(8, 0)
  vi.advanceTimersByTime(449)
  expect(action).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(action).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(1000)
  expect(action).toHaveBeenCalledTimes(1)
})
it('cancels beyond 8px, including diagonal movement, and on explicit scroll/release cancellation', () => {
  vi.useFakeTimers()
  const action = vi.fn(),
    press = createLongPress(action)
  press.start(0, 0)
  press.move(6, 6)
  vi.advanceTimersByTime(450)
  press.start(0, 0)
  press.cancel()
  vi.advanceTimersByTime(450)
  expect(action).not.toHaveBeenCalled()
})
