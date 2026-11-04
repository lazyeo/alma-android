// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HANDOFF_EXIT_MS,
  HANDOFF_READY_TIMEOUT_MS,
  useAlmaHandoff,
  watchThreadReady,
  type HandoffPhase,
  type ReadyScheduler,
} from './almaHandoff'

/** Frames run only when the test steps them. */
function manualFrames() {
  let queue: Array<() => void> = []
  let time = 0
  const scheduler: ReadyScheduler = {
    frame(callback) {
      queue.push(callback)
      return queue.length
    },
    cancel() {
      queue = []
    },
    now: () => time,
  }
  const step = (count = 1, ms = 8) => {
    for (let index = 0; index < count; index++) {
      time += ms
      const due = queue
      queue = []
      for (const callback of due) callback()
    }
  }
  return { scheduler, step, pending: () => queue.length }
}

/** A list element whose scroll geometry the test controls. */
function threadLayer(geometry: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
  rows?: number
}) {
  const layer = document.createElement('div')
  const scroller = document.createElement('div')
  scroller.className = 'message-scroll'
  layer.append(scroller)
  const set = (next: Partial<typeof geometry>) => {
    Object.assign(geometry, next)
    scroller.replaceChildren(
      ...Array.from({ length: geometry.rows ?? 1 }, () => {
        const row = document.createElement('div')
        row.dataset.rowId = 'r'
        return row
      }),
    )
  }
  for (const key of ['scrollHeight', 'scrollTop', 'clientHeight'] as const)
    Object.defineProperty(scroller, key, { get: () => geometry[key] })
  set({})
  return { layer, set }
}

describe('watchThreadReady', () => {
  it('waits for the list to sit still at its bottom, then for a paint', () => {
    const { scheduler, step } = manualFrames()
    const { layer, set } = threadLayer({
      scrollHeight: 2000,
      scrollTop: 0,
      clientHeight: 800,
    })
    const ready = vi.fn()
    watchThreadReady(layer, ready, scheduler)
    step(3)
    expect(ready).not.toHaveBeenCalled()
    // Scrolled to the bottom, but rows are still measuring.
    set({ scrollTop: 1200 })
    step()
    set({ scrollHeight: 2100, scrollTop: 1300, rows: 2 })
    step(2)
    expect(ready).not.toHaveBeenCalled()
    // Two still frames, then two frames to paint.
    step(2)
    expect(ready).not.toHaveBeenCalled()
    step(2)
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('hands off after the timeout when no list settles', () => {
    const { scheduler, step } = manualFrames()
    const ready = vi.fn()
    watchThreadReady(document.createElement('div'), ready, scheduler)
    step(Math.ceil(HANDOFF_READY_TIMEOUT_MS / 8) - 1)
    expect(ready).not.toHaveBeenCalled()
    step(3)
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('stops when cancelled', () => {
    const { scheduler, step, pending } = manualFrames()
    const { layer } = threadLayer({
      scrollHeight: 800,
      scrollTop: 0,
      clientHeight: 800,
    })
    const ready = vi.fn()
    const cancel = watchThreadReady(layer, ready, scheduler)
    step()
    cancel()
    step(10)
    expect(ready).not.toHaveBeenCalled()
    expect(pending()).toBe(0)
  })
})

describe('useAlmaHandoff', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  function setup(reduced: boolean) {
    const frames = manualFrames()
    const { layer } = threadLayer({
      scrollHeight: 800,
      scrollTop: 0,
      clientHeight: 800,
    })
    const phases: HandoffPhase[] = []
    function Harness({ deferred }: { deferred: boolean }) {
      const ref = useRef<HTMLElement>(layer)
      const phase = useAlmaHandoff(deferred, ref, {
        reduced: () => reduced,
        scheduler: frames.scheduler,
      })
      if (phases.at(-1) !== phase) phases.push(phase)
      return null
    }
    const view = render(<Harness deferred />)
    return { ...frames, phases, view, Harness }
  }

  it('keeps the shell until the real thread is ready, then fades it', () => {
    const { phases, view, Harness, step } = setup(false)
    expect(phases).toEqual(['shell'])
    view.rerender(<Harness deferred={false} />)
    expect(phases).toEqual(['shell', 'mounting'])
    act(() => step(3))
    expect(phases.at(-1)).toBe('mounting')
    act(() => step(2))
    expect(phases.at(-1)).toBe('fading')
    act(() => void vi.advanceTimersByTime(HANDOFF_EXIT_MS - 1))
    expect(phases.at(-1)).toBe('fading')
    act(() => void vi.advanceTimersByTime(1))
    expect(phases).toEqual(['shell', 'mounting', 'fading', 'real'])
  })

  it('swaps without the fade under reduced motion, still after ready', () => {
    const { phases, view, Harness, step } = setup(true)
    view.rerender(<Harness deferred={false} />)
    act(() => step(3))
    expect(phases.at(-1)).toBe('mounting')
    act(() => step(2))
    expect(phases).toEqual(['shell', 'mounting', 'real'])
  })

  it('renders the real thread at once when nothing was deferred', () => {
    const phases: HandoffPhase[] = []
    function Direct() {
      const ref = useRef<HTMLElement>(null)
      phases.push(useAlmaHandoff(false, ref))
      return null
    }
    render(<Direct />)
    expect(new Set(phases)).toEqual(new Set(['real']))
  })
})
