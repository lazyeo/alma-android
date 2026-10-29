import { describe, expect, it } from 'vitest'
import { nextTerminalScrollTop } from './terminalScroll'

describe('terminal native scroll anchoring', () => {
  it('keeps the same content visible when earlier history is prepended', () => {
    expect(
      nextTerminalScrollTop({
        previousScrollTop: 180,
        previousScrollHeight: 900,
        nextScrollHeight: 1500,
        clientHeight: 500,
        prepending: true,
        pinned: false,
      }),
    ).toBe(780)
  })

  it('follows the bottom when live frames arrive while pinned', () => {
    expect(
      nextTerminalScrollTop({
        previousScrollTop: 400,
        previousScrollHeight: 900,
        nextScrollHeight: 940,
        clientHeight: 500,
        prepending: false,
        pinned: true,
      }),
    ).toBe(440)
  })

  it('does not jump when live frames arrive while scrolled up', () => {
    expect(
      nextTerminalScrollTop({
        previousScrollTop: 120,
        previousScrollHeight: 900,
        nextScrollHeight: 960,
        clientHeight: 500,
        prepending: false,
        pinned: false,
      }),
    ).toBe(120)
  })
})
