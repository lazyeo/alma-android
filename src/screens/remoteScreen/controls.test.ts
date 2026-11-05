import { describe, expect, it, vi } from 'vitest'
import {
  buildKeyCombo,
  createMoveCoalescer,
  createScrollCoalescer,
  pointerAt,
} from './controls'

describe('pointerAt', () => {
  it('maps selection drag actions to down, ordinary moves, then up', () => {
    expect([
      pointerAt('drag-start', { x: 0.1, y: 0.2 }),
      pointerAt('move', { x: 0.2, y: 0.25 }),
      pointerAt('move', { x: 0.3, y: 0.4 }),
      pointerAt('drag-end', { x: 0.3, y: 0.4 }),
    ]).toEqual([
      { type: 'pointer', action: 'down', x: 0.1, y: 0.2 },
      { type: 'pointer', action: 'move', x: 0.2, y: 0.25 },
      { type: 'pointer', action: 'move', x: 0.3, y: 0.4 },
      { type: 'pointer', action: 'up', x: 0.3, y: 0.4 },
    ])
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

  it('flushes the final drag move before mouse up', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const coalescer = createMoveCoalescer<string>(
      (value) => sent.push(value),
      33,
    )
    coalescer.push('move-1')
    coalescer.push('move-2')
    coalescer.flush()
    sent.push('up')
    vi.advanceTimersByTime(33)
    expect(sent).toEqual(['move-1', 'move-2', 'up'])
    coalescer.close()
    vi.useRealTimers()
  })
})

describe('createScrollCoalescer', () => {
  const scroll = (x: number, dx: number, dy: number) =>
    ({ type: 'scroll', x, y: 0.5, dx, dy }) as const

  it('sends the first scroll at once, then sums the rest per interval', () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    const coalescer = createScrollCoalescer((value) => sent.push(value), 33)
    coalescer.push(scroll(0.1, 0, 4))
    for (let index = 0; index < 10; index++) coalescer.push(scroll(0.2, 1, 3))
    expect(sent).toEqual([scroll(0.1, 0, 4)])
    vi.advanceTimersByTime(33)
    expect(sent).toEqual([scroll(0.1, 0, 4), scroll(0.2, 10, 30)])
    vi.advanceTimersByTime(100)
    expect(sent).toHaveLength(2)
    coalescer.close()
    vi.useRealTimers()
  })

  it('carries sub-pixel movement until it adds up to a pixel', () => {
    vi.useFakeTimers()
    const sent: { dx: number; dy: number }[] = []
    const coalescer = createScrollCoalescer((value) => sent.push(value), 33)
    coalescer.push(scroll(0.5, 0, 0.4))
    coalescer.push(scroll(0.5, 0, 0.4))
    expect(sent).toEqual([])
    coalescer.push(scroll(0.5, 0, 0.4))
    expect(sent).toEqual([expect.objectContaining({ dx: 0, dy: 1 })])
    coalescer.push(scroll(0.5, 0, -2.5))
    vi.advanceTimersByTime(33)
    // 0.2 carried − 2.5 = −2.3 → −2, −0.3 carried.
    expect(sent.at(-1)).toEqual(expect.objectContaining({ dy: -2 }))
    coalescer.close()
    vi.useRealTimers()
  })

  it('flushes whole pixels and drops the remainder', () => {
    vi.useFakeTimers()
    const sent: { dy: number }[] = []
    const coalescer = createScrollCoalescer((value) => sent.push(value), 33)
    coalescer.push(scroll(0.5, 0, 5))
    coalescer.push(scroll(0.5, 0, 2.7))
    coalescer.flush()
    expect(sent.map((value) => value.dy)).toEqual([5, 2])
    coalescer.push(scroll(0.5, 0, 0.5))
    vi.advanceTimersByTime(100)
    expect(sent).toHaveLength(2)
    coalescer.close()
    vi.useRealTimers()
  })
})
