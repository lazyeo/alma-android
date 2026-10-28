import { describe, expect, it } from 'vitest'
import { placeAnchoredMenu } from '../components/anchoredMenuPlacement'
import { visibleContentRect } from './DesktopSwitcher'

function box(left: number, right: number, top = 760, bottom = 788) {
  return { getBoundingClientRect: () => ({ left, right, top, bottom }) }
}

describe('desktop strip menu anchor', () => {
  it('anchors to the centred name and chevron, not the full-width strip', () => {
    // Outer display: 412px strip, content centred around x=206.
    const chevron = box(240, 254)
    const content = { ...box(158, 238), nextElementSibling: chevron }
    const anchor = visibleContentRect(content as unknown as Element)
    expect(anchor).toEqual({ left: 158, right: 254, top: 760, bottom: 788 })
    const placement = placeAnchoredMenu(
      anchor!,
      { width: 220, height: 160 },
      { width: 412, height: 900 },
    )
    // Right-aligned to the chevron rather than the screen edge.
    expect(placement.left).toBe(254 - 220)
  })

  it('falls back to the name when there is no chevron', () => {
    const content = { ...box(20, 120), nextElementSibling: null }
    expect(visibleContentRect(content as unknown as Element)?.right).toBe(120)
    expect(visibleContentRect(null)).toBeUndefined()
  })
})
