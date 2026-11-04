// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePullToRefresh } from './usePullToRefresh'

function Harness({ onRefresh }: { onRefresh(): Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null)
  const pull = usePullToRefresh(ref, onRefresh)
  return (
    <div ref={ref} data-testid="scroller">
      <span data-testid="distance">{pull.distance}</span>
      <span data-testid="refreshing">{String(pull.refreshing)}</span>
      <input data-testid="field" />
    </div>
  )
}

const touch = (
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
) => {
  const point = { clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, {
    touches: type === 'touchend' ? [] : [point],
    changedTouches: [point],
  })
  target.dispatchEvent(event)
  return event
}

function drag(target: Element, dx: number, dy: number) {
  act(() => {
    touch(target, 'touchstart', 100, 100)
    for (let step = 1; step <= 4; step += 1)
      touch(target, 'touchmove', 100 + (dx * step) / 4, 100 + (dy * step) / 4)
  })
}

afterEach(cleanup)

describe('usePullToRefresh', () => {
  it('refreshes after a long downward pull at the top', async () => {
    let resolve!: () => void
    const onRefresh = vi.fn(() => new Promise<void>((done) => (resolve = done)))
    const view = render(<Harness onRefresh={onRefresh} />)
    const scroller = view.getByTestId('scroller')

    drag(scroller, 0, 300)
    expect(Number(view.getByTestId('distance').textContent)).toBeGreaterThan(0)
    act(() => void touch(scroller, 'touchend', 100, 400))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(view.getByTestId('refreshing').textContent).toBe('true')
    await act(async () => resolve())
    expect(view.getByTestId('refreshing').textContent).toBe('false')
    expect(view.getByTestId('distance').textContent).toBe('0')
  })

  it('springs back without refreshing on a short pull', () => {
    const onRefresh = vi.fn(async () => {})
    const view = render(<Harness onRefresh={onRefresh} />)
    const scroller = view.getByTestId('scroller')
    drag(scroller, 0, 40)
    act(() => void touch(scroller, 'touchend', 100, 140))
    expect(onRefresh).not.toHaveBeenCalled()
    expect(view.getByTestId('distance').textContent).toBe('0')
  })

  it('ignores horizontal swipes, scrolled lists, and text fields', () => {
    const onRefresh = vi.fn(async () => {})
    const view = render(<Harness onRefresh={onRefresh} />)
    const scroller = view.getByTestId('scroller')

    drag(scroller, 300, 60)
    act(() => void touch(scroller, 'touchend', 400, 160))

    scroller.scrollTop = 120
    drag(scroller, 0, 300)
    act(() => void touch(scroller, 'touchend', 100, 400))
    scroller.scrollTop = 0

    const field = view.getByTestId('field')
    drag(field, 0, 300)
    act(() => void touch(field, 'touchend', 100, 400))

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('stops native overscroll only once the pull is claimed', () => {
    const view = render(<Harness onRefresh={vi.fn(async () => {})} />)
    const scroller = view.getByTestId('scroller')
    let first!: Event, later!: Event
    act(() => {
      touch(scroller, 'touchstart', 100, 100)
      first = touch(scroller, 'touchmove', 100, 104)
      later = touch(scroller, 'touchmove', 100, 160)
    })
    expect(first.defaultPrevented).toBe(false)
    expect(later.defaultPrevented).toBe(true)
  })
})
