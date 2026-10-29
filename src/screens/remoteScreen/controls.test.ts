import { describe, expect, it, vi } from 'vitest'
import {
  buildKeyCombo,
  createMoveCoalescer,
  mapClientPoint,
  reduceTrackpadGesture,
  type TrackpadState,
} from './controls'

describe('mapClientPoint', () => {
  it('maps through letterboxing at fit scale', () => {
    expect(
      mapClientPoint(
        { x: 200, y: 150 },
        { width: 400, height: 300 },
        { width: 1600, height: 900 },
        { scale: 1, x: 0, y: 0 },
      ),
    ).toEqual({ x: 0.5, y: 0.5, inside: true })
    expect(
      mapClientPoint(
        { x: 200, y: 20 },
        { width: 400, height: 300 },
        { width: 1600, height: 900 },
        { scale: 1, x: 0, y: 0 },
      ).inside,
    ).toBe(false)
  })

  it('accounts for client zoom and pan', () => {
    expect(
      mapClientPoint(
        { x: 300, y: 262.5 },
        { width: 400, height: 300 },
        { width: 1600, height: 900 },
        { scale: 2, x: 100, y: 0 },
      ),
    ).toMatchObject({ x: 0.25, y: 0.5, inside: true })
  })
})

describe('buildKeyCombo', () => {
  it('orders sticky modifiers for the computer-use combo syntax', () => {
    expect(
      buildKeyCombo({ meta: true, alt: true, ctrl: true, shift: true }, 'left'),
    ).toBe('cmd+alt+ctrl+shift+left')
  })

  it('normalizes special key names', () => {
    expect(buildKeyCombo({}, 'Enter')).toBe('enter')
    expect(buildKeyCombo({ shift: true }, 'Backspace')).toBe('shift+backspace')
  })
})

describe('reduceTrackpadGesture', () => {
  const initial: TrackpadState = {
    cursor: { x: 0.5, y: 0.5 },
    phase: 'idle',
  }

  it('moves the virtual cursor relatively and emits absolute normalized moves', () => {
    const result = reduceTrackpadGesture(initial, {
      type: 'move',
      dx: 20,
      dy: -10,
      sensitivity: 0.002,
    })
    expect(result.state.cursor).toEqual({ x: 0.54, y: 0.48 })
    expect(result.events).toEqual([
      { type: 'pointer', action: 'move', x: 0.54, y: 0.48 },
    ])
  })

  it('maps taps, two-finger taps, scrolling, and drag lifecycle', () => {
    expect(
      reduceTrackpadGesture(initial, { type: 'tap', fingers: 1 }).events,
    ).toEqual([{ type: 'pointer', action: 'click', x: 0.5, y: 0.5 }])
    expect(
      reduceTrackpadGesture(initial, { type: 'tap', fingers: 2 }).events,
    ).toEqual([{ type: 'pointer', action: 'right', x: 0.5, y: 0.5 }])
    expect(
      reduceTrackpadGesture(initial, {
        type: 'scroll',
        dx: 4,
        dy: -8,
      }).events,
    ).toEqual([{ type: 'scroll', x: 0.5, y: 0.5, dx: 4, dy: -8 }])
    const down = reduceTrackpadGesture(initial, { type: 'drag-start' })
    expect(down.events[0]).toMatchObject({ action: 'down' })
    const moved = reduceTrackpadGesture(down.state, {
      type: 'move',
      dx: 10,
      dy: 0,
      sensitivity: 0.002,
    })
    const up = reduceTrackpadGesture(moved.state, { type: 'drag-end' })
    expect(up.events[0]).toMatchObject({ action: 'up', x: 0.52 })
  })
})

describe('createMoveCoalescer', () => {
  it('sends at most once per interval and flushes the latest move', () => {
    vi.useFakeTimers()
    const sent: number[] = []
    const coalescer = createMoveCoalescer<number>(
      (value) => sent.push(value),
      33,
    )
    coalescer.push(1)
    coalescer.push(2)
    coalescer.push(3)
    expect(sent).toEqual([1])
    vi.advanceTimersByTime(33)
    expect(sent).toEqual([1, 3])
    coalescer.close()
    vi.useRealTimers()
  })
})
