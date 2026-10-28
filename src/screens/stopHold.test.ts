import { describe, expect, it } from 'vitest'
import {
  beginStopHold,
  calculateStopHoldOffset,
  STOP_HOLD_MS,
  stopHoldProgress,
  updateStopHold,
} from './stopHold'

describe('hold to stop', () => {
  it('uses a two-second hold duration', () => {
    expect(STOP_HOLD_MS).toBe(2_000)
  })

  it('requires the full hold duration before stopping', () => {
    const started = beginStopHold(1_000, { x: 20, y: 30 })
    expect(stopHoldProgress(started, 2_000)).toBeCloseTo(0.5)

    const released = updateStopHold(started, {
      type: 'release',
      now: 1_999,
    })
    expect(released.effect).toBe('hint')
    expect(released.state.active).toBe(false)
  })

  it('fires stop once when the hold completes', () => {
    const started = beginStopHold(1_000, { x: 20, y: 30 })
    const completed = updateStopHold(started, {
      type: 'tick',
      now: 3_000,
    })
    expect(completed.effect).toBe('stop')
    expect(completed.state.active).toBe(false)
    expect(stopHoldProgress(completed.state, 2_000)).toBe(1)

    expect(
      updateStopHold(completed.state, { type: 'tick', now: 1_700 }).effect,
    ).toBeUndefined()
  })

  it('cancels when the pointer moves more than twelve pixels', () => {
    const started = beginStopHold(1_000, { x: 20, y: 30 })
    expect(
      updateStopHold(started, {
        type: 'move',
        now: 1_200,
        point: { x: 33, y: 30 },
      }),
    ).toMatchObject({
      effect: undefined,
      state: { active: false, progress: 0 },
    })
  })

  it('supports keyboard holds without a pointer origin', () => {
    const started = beginStopHold(1_000)
    expect(updateStopHold(started, { type: 'tick', now: 3_000 }).effect).toBe(
      'stop',
    )
  })

  it('moves an enlarged ring inward to keep an eight pixel viewport margin', () => {
    expect(
      calculateStopHoldOffset({
        center: { x: 396, y: 500 },
        radius: 44,
        viewport: { width: 412, height: 915 },
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    ).toEqual({ x: -36, y: 0 })

    expect(
      calculateStopHoldOffset({
        center: { x: 14, y: 24 },
        radius: 44,
        viewport: { width: 884, height: 1104 },
        safeArea: { top: 20, right: 8, bottom: 24, left: 10 },
      }),
    ).toEqual({ x: 48, y: 48 })
  })

  it('does not move a ring that already has enough space', () => {
    expect(
      calculateStopHoldOffset({
        center: { x: 200, y: 400 },
        radius: 44,
        viewport: { width: 412, height: 915 },
      }),
    ).toEqual({ x: 0, y: 0 })
  })
})
