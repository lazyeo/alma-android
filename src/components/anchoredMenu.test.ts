import { describe, expect, it } from 'vitest'
import {
  anchoredMenuHasContent,
  narrowAnchorToContent,
  placeAnchoredMenu,
} from './anchoredMenuPlacement'

describe('full-width menu triggers', () => {
  const row = (left: number, right: number) => ({
    left,
    right,
    top: 60,
    bottom: 84,
  })

  it('anchors a left-aligned project subtitle to its content', () => {
    // Outer display thread header: subtitle spans 16–396, content 16–150.
    const anchor = narrowAnchorToContent(row(16, 396), [
      row(16, 28),
      row(33, 132),
      row(136, 150),
    ])
    expect(anchor).toEqual(row(16, 150))
    const placement = placeAnchoredMenu(
      anchor,
      { width: 220, height: 200 },
      { width: 412, height: 900 },
    )
    expect(placement.left).toBe(16)
  })

  it('leaves icon buttons and snug triggers on their own box', () => {
    expect(narrowAnchorToContent(row(360, 400), [row(370, 390)])).toEqual(
      row(360, 400),
    )
    expect(narrowAnchorToContent(row(16, 396), [])).toEqual(row(16, 396))
  })
})

describe('anchored menu placement', () => {
  it('aligns the menu right edge to a trigger near the viewport right edge', () => {
    expect(
      placeAnchoredMenu(
        { left: 340, right: 380, top: 40, bottom: 80 },
        { width: 200, height: 180 },
        { width: 400, height: 800 },
      ),
    ).toMatchObject({
      left: 180,
      top: 84,
      placement: 'below',
      originX: 'right',
    })
  })

  it('flips above when there is not enough room below', () => {
    expect(
      placeAnchoredMenu(
        { left: 210, right: 250, top: 700, bottom: 740 },
        { width: 190, height: 220 },
        { width: 400, height: 800 },
      ),
    ).toMatchObject({ top: 476, placement: 'above' })
  })

  it('clamps press-point menus to safe viewport bounds', () => {
    expect(
      placeAnchoredMenu(
        { left: 2, right: 2, top: 2, bottom: 2 },
        { width: 180, height: 120 },
        { width: 400, height: 800 },
        { top: 20, right: 8, bottom: 24, left: 12 },
      ),
    ).toMatchObject({ left: 12, top: 20 })
  })
})

describe('anchored menu content', () => {
  it('stays closed when it has neither rows nor a header', () => {
    expect(anchoredMenuHasContent(0, false)).toBe(false)
    expect(anchoredMenuHasContent(0, true)).toBe(true)
    expect(anchoredMenuHasContent(1, false)).toBe(true)
  })
})
