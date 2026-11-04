// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextPresence, PRESENCE_EXIT_MS, usePresence } from './usePresence'

const FRAME = 16

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  })
})
afterEach(() => vi.useRealTimers())

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('nextPresence', () => {
  it('retargets a surface shown again mid-exit instead of restarting it', () => {
    expect(nextPresence({ rendered: true, phase: 'exiting' }, true)).toEqual({
      rendered: true,
      phase: 'entered',
    })
    expect(nextPresence({ rendered: false, phase: 'exiting' }, true)).toEqual({
      rendered: true,
      phase: 'entering',
    })
    expect(nextPresence({ rendered: true, phase: 'entered' }, false)).toEqual({
      rendered: true,
      phase: 'exiting',
    })
  })
})

describe('usePresence', () => {
  it('opens finished when visible on mount', () => {
    const { result } = renderHook(() => usePresence(true))
    expect(result.current).toEqual({ rendered: true, phase: 'entered' })
    advance(FRAME * 3)
    expect(result.current.phase).toBe('entered')
  })

  it('paints one entering frame before entered', () => {
    const { result, rerender } = renderHook(
      ({ visible }) => usePresence(visible),
      { initialProps: { visible: false } },
    )
    expect(result.current.rendered).toBe(false)
    rerender({ visible: true })
    expect(result.current).toEqual({ rendered: true, phase: 'entering' })
    advance(FRAME)
    expect(result.current.phase).toBe('entering')
    advance(FRAME)
    expect(result.current.phase).toBe('entered')
  })

  it('plays the entrance on mount when asked to appear', () => {
    const { result } = renderHook(() => usePresence(true, { appear: true }))
    expect(result.current.phase).toBe('entering')
    advance(FRAME * 2)
    expect(result.current.phase).toBe('entered')
  })

  it('stays mounted until its own exit duration has run', () => {
    const { result, rerender } = renderHook(
      ({ visible }) => usePresence(visible, { exitMs: 360 }),
      { initialProps: { visible: true } },
    )
    rerender({ visible: false })
    expect(result.current).toEqual({ rendered: true, phase: 'exiting' })
    advance(PRESENCE_EXIT_MS)
    expect(result.current.rendered).toBe(true)
    advance(360 - PRESENCE_EXIT_MS)
    expect(result.current.rendered).toBe(false)
  })

  it('keeps a surface shown again mid-exit mounted and entered', () => {
    const { result, rerender } = renderHook(
      ({ visible }) => usePresence(visible),
      { initialProps: { visible: true } },
    )
    rerender({ visible: false })
    advance(PRESENCE_EXIT_MS / 2)
    rerender({ visible: true })
    expect(result.current).toEqual({ rendered: true, phase: 'entered' })
    advance(PRESENCE_EXIT_MS * 2)
    expect(result.current).toEqual({ rendered: true, phase: 'entered' })
  })
})
