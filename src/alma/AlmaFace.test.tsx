// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlmaFace } from './AlmaFace'

let reduced = false
beforeEach(() => {
  reduced = false
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? reduced : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const face = (container: HTMLElement) =>
  container.querySelector('svg.alma-face') as SVGSVGElement

describe('AlmaFace', () => {
  it('exposes mood and activity for CSS and stays decorative', () => {
    const { container } = render(
      <AlmaFace size={40} mood="tired" activity="thinking" />,
    )
    const svg = face(container)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.dataset.mood).toBe('tired')
    expect(svg.dataset.activity).toBe('thinking')
    expect(svg.dataset.animated).toBe('true')
    expect(svg.getAttribute('width')).toBe('40')
  })

  it('blinks after 4 s and reopens', () => {
    const { container } = render(<AlmaFace size={40} />)
    expect(face(container).dataset.blink).toBeUndefined()
    act(() => vi.advanceTimersByTime(4000))
    expect(face(container).dataset.blink).toBe('true')
    act(() => vi.advanceTimersByTime(140))
    expect(face(container).dataset.blink).toBeUndefined()
  })

  it('draws curved eyes when happy, so there are no lids to blink', () => {
    const { container } = render(<AlmaFace size={40} mood="happy" />)
    expect(container.querySelector('.alma-face-lid')).toBeNull()
    expect(container.querySelector('.alma-face-eye')).toBeNull()
    act(() => vi.advanceTimersByTime(8000))
    expect(face(container).dataset.blink).toBeUndefined()
  })

  it('turns every idle animation off, blink included, under reduced motion', () => {
    reduced = true
    const { container } = render(
      <AlmaFace size={40} activity="thinking" />,
    )
    expect(face(container).dataset.animated).toBe('false')
    act(() => vi.advanceTimersByTime(10000))
    expect(face(container).dataset.blink).toBeUndefined()
  })

  it('keeps repeated still copies quiet', () => {
    const { container } = render(<AlmaFace size={24} still />)
    expect(face(container).dataset.animated).toBe('false')
    act(() => vi.advanceTimersByTime(10000))
    expect(face(container).dataset.blink).toBeUndefined()
  })

  it('gives each copy its own lens clip ids', () => {
    const { container } = render(
      <>
        <AlmaFace size={40} />
        <AlmaFace size={40} />
      </>,
    )
    const ids = [...container.querySelectorAll('clipPath')].map((node) => node.id)
    expect(new Set(ids).size).toBe(4)
  })
})
