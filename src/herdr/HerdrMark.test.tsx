// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HerdrMark } from './HerdrMark'

afterEach(cleanup)

describe('HerdrMark', () => {
  it('renders the official Herdr vector in the current text color', () => {
    const { container } = render(<HerdrMark size={22} className="mark" />)
    const mark = container.firstElementChild as SVGElement
    const path = mark.querySelector('path')

    expect(mark.tagName.toLowerCase()).toBe('svg')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.classList.contains('herdr-mark')).toBe(true)
    expect(mark.classList.contains('mark')).toBe(true)
    expect(mark.getAttribute('width')).toBe('22')
    expect(mark.getAttribute('height')).toBe('22')
    expect(mark.getAttribute('viewBox')).toBe(
      '104.2286 139.1073 407.7714 372.8927',
    )
    expect(path).not.toBeNull()
    expect(path?.getAttribute('fill')).toBe('currentColor')
    expect(path?.getAttribute('transform')).toBe(
      'translate(0 512) scale(.1 -.1)',
    )
    expect(mark.querySelector('rect')).toBeNull()
  })
})
