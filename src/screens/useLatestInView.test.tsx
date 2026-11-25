// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLatestInView } from './useLatestInView'

let resize: () => void = () => {}
class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback
  }
  observe() {}
  disconnect() {}
}

/** A list of fixed content height whose box the test resizes. */
const box = { clientHeight: 600, scrollHeight: 2000 }

function List() {
  const ref = useRef<HTMLDivElement>(null)
  useLatestInView(ref)
  return (
    <div
      data-testid="list"
      ref={(element) => {
        if (!element) return
        Object.defineProperty(element, 'clientHeight', {
          configurable: true,
          get: () => box.clientHeight,
        })
        Object.defineProperty(element, 'scrollHeight', {
          configurable: true,
          get: () => box.scrollHeight,
        })
        ;(ref as { current: HTMLDivElement }).current = element
      }}
    />
  )
}

function mount(scrollTop: number) {
  const view = render(<List />)
  const list = view.getByTestId('list')
  list.scrollTop = scrollTop
  list.dispatchEvent(new Event('scroll'))
  return list
}

/** The composer grows (options open, keyboard up): the list shrinks. */
function shrinkTo(height: number) {
  box.clientHeight = height
  resize()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  box.clientHeight = 600
  box.scrollHeight = 2000
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useLatestInView', () => {
  it('keeps the latest message in view as the composer grows', () => {
    const list = mount(1400)
    shrinkTo(480)
    expect(list.scrollTop).toBe(2000)
  })

  it('follows every frame of the height transition and the keyboard', () => {
    const list = mount(1400)
    for (const height of [580, 540, 500, 480, 260]) {
      list.scrollTop = 2000 - height
      shrinkTo(height)
      expect(list.scrollTop).toBe(2000)
    }
  })

  it('stays pinned when a scroll event lands between the shrink and the observer', () => {
    // Tap to type: the options open and the keyboard rises together.
    const list = mount(1400)
    box.clientHeight = 300
    list.dispatchEvent(new Event('scroll'))
    resize()
    expect(list.scrollTop).toBe(2000)
  })

  it('leaves a reader scrolled up into the history where they are', () => {
    const list = mount(200)
    shrinkTo(480)
    expect(list.scrollTop).toBe(200)
  })

  it('does nothing when only the width changed', () => {
    const list = mount(1400)
    resize()
    expect(list.scrollTop).toBe(1400)
  })
})
