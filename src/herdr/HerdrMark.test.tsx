// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import herdrMarkUrl from '../assets/herdr-mark.png'
import { HerdrMark } from './HerdrMark'

afterEach(cleanup)

describe('HerdrMark', () => {
  it('renders the Herdr asset as a current-color mask', () => {
    const { container } = render(<HerdrMark size={22} className="mark" />)
    const mark = container.firstElementChild as HTMLElement

    expect(herdrMarkUrl).toMatchInlineSnapshot('"/src/assets/herdr-mark.png"')
    expect(mark.tagName).toBe('SPAN')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.classList.contains('herdr-mark')).toBe(true)
    expect(mark.classList.contains('mark')).toBe(true)
    expect(mark.style.background).toBe('currentcolor')
    expect(mark.style.mask).toContain(herdrMarkUrl)
    expect(mark.style.webkitMask).toContain(herdrMarkUrl)
  })
})
