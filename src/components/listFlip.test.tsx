// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planListFlip, useListFlip, type FlipBox } from './listFlip'

const ROW = 66
const boxes = (...keys: string[]) =>
  new Map<string, FlipBox>(
    keys.map((key, index) => [key, { top: index * ROW, height: ROW }]),
  )
const view = { top: 0, bottom: 800 }

describe('planListFlip', () => {
  it('takes the first measurement as a baseline', () => {
    expect(planListFlip(new Map(), boxes('a', 'b'), view)).toEqual({
      moves: [],
      enters: [],
    })
  })

  it('leaves an unchanged order alone', () => {
    expect(planListFlip(boxes('a', 'b'), boxes('a', 'b'), view)).toEqual({
      moves: [],
      enters: [],
    })
  })

  it('carries the rows below a removed row from where they were', () => {
    expect(planListFlip(boxes('a', 'b', 'c'), boxes('b', 'c'), view)).toEqual({
      moves: [
        { key: 'b', dy: ROW },
        { key: 'c', dy: ROW },
      ],
      enters: [],
    })
  })

  it('moves a row to the top and lets a new row rise in', () => {
    expect(
      planListFlip(boxes('a', 'b', 'c'), boxes('n', 'c', 'a', 'b'), view),
    ).toEqual({
      moves: [
        { key: 'c', dy: ROW },
        { key: 'a', dy: -2 * ROW },
        { key: 'b', dy: -2 * ROW },
      ],
      enters: ['n'],
    })
  })

  it('treats a mostly different list as a swap, not an edit', () => {
    expect(
      planListFlip(boxes('a', 'b', 'c', 'd'), boxes('a', 'x', 'y', 'z'), view),
    ).toEqual({ moves: [], enters: [] })
  })

  it('skips rows off screen at both ends and floods of new rows', () => {
    const plan = planListFlip(
      boxes('a', 'b', 'c', 'd'),
      boxes('n1', 'n2', 'a', 'b', 'c', 'd'),
      { top: 0, bottom: 3 * ROW },
      1,
    )
    expect(plan.enters).toEqual([])
    expect(plan.moves.map((move) => move.key)).toEqual(['a', 'b', 'c'])
  })
})

function List({ keys }: { keys: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useListFlip(ref)
  return (
    <div ref={ref}>
      {keys.map((key) => (
        <article key={key} data-flip-key={key} />
      ))}
    </div>
  )
}

describe('useListFlip', () => {
  const animate = vi.fn(() => ({ playState: 'running', cancel() {} }))

  beforeEach(() => {
    animate.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const parent = this.parentElement
        const index =
          this.dataset.flipKey && parent
            ? [...parent.children].indexOf(this)
            : 0
        return {
          top: this.dataset.flipKey ? index * ROW : 0,
          height: ROW,
        } as DOMRect
      },
    )
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (HTMLElement.prototype as { animate?: unknown }).animate
    document.documentElement.removeAttribute('data-nav-motion')
  })

  it('glides the rows below a removed row up from their old place', () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<List keys={['b', 'c']} />)
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate.mock.calls[0]).toEqual([
      [{ translate: `0 ${ROW}px` }, { translate: '0 0' }],
      expect.objectContaining({ duration: 250 }),
    ])
  })

  it('does not move rows while a route transition runs', () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)
    document.documentElement.dataset.navMotion = 'push'
    rerender(<List keys={['b', 'c']} />)
    expect(animate).not.toHaveBeenCalled()
  })
})
