import { describe, expect, it } from 'vitest'
import {
  PREVIEW_MARGIN_PX,
  PREVIEW_MAX_VIEWPORT_FRACTION,
  PREVIEW_SCALE,
  previewCardFrom,
  previewCardRect,
  type PreviewCardInput,
  type PreviewRectLike,
} from './longPressPreview'

// A phone: 412×900, chat column 16–396, status bar to 40, sheet from 600.
const base = (
  source: Partial<PreviewRectLike> = {},
  rest: Partial<Omit<PreviewCardInput, 'source'>> = {},
): PreviewCardInput => ({
  source: { left: 16, top: 200, width: 380, height: 100, ...source },
  column: { left: 16, right: 396 },
  viewport: { width: 412, height: 900 },
  safeTop: 40,
  sheetTop: 600,
  ...rest,
})

const parseTransform = (transform: string) => {
  const match =
    /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(transform)
  if (!match) throw new Error(`unexpected transform: ${transform}`)
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) }
}

describe('previewCardRect', () => {
  it('keeps a short message at its own top, scaled with padding', () => {
    const card = previewCardRect(base())!
    expect(card.top).toBe(200)
    expect(card.scale).toBe(PREVIEW_SCALE)
    // Side padding comes from the scale: 380 × 0.12 / 2.
    expect(card.contentLeft).toBeCloseTo(22.8)
    expect(card.contentTop).toBe(16)
    expect(card.height).toBeCloseTo(100 * PREVIEW_SCALE + 32)
    expect(card.clipped).toBe(false)
  })

  it('fits between the status bar and the sheet', () => {
    for (const top of [-300, 0, 45, 200, 550, 880]) {
      const input = base({ top })
      const card = previewCardRect(input)!
      expect(card.top).toBeGreaterThanOrEqual(input.safeTop + PREVIEW_MARGIN_PX)
      expect(card.top + card.height).toBeLessThanOrEqual(
        input.sheetTop - PREVIEW_MARGIN_PX + 1e-9,
      )
    }
  })

  it('puts a card whose message top scrolled away right above the sheet', () => {
    const card = previewCardRect(base({ top: 10 }))!
    expect(card.top + card.height).toBeCloseTo(600 - PREVIEW_MARGIN_PX)
  })

  it('clips a tall message and caps the card height', () => {
    const card = previewCardRect(base({ height: 1000 }))!
    expect(card.clipped).toBe(true)
    expect(card.height).toBeCloseTo(900 * PREVIEW_MAX_VIEWPORT_FRACTION)
  })

  it('caps the height by the free band when it is below the viewport share', () => {
    const card = previewCardRect(base({ height: 1000 }, { sheetTop: 300 }))!
    expect(card.clipped).toBe(true)
    expect(card.height).toBeCloseTo(300 - 40 - PREVIEW_MARGIN_PX * 2)
  })

  it('spans the column even for a narrower, right-aligned bubble', () => {
    const card = previewCardRect(base({ left: 200, width: 150 }))!
    expect(card.left).toBe(16)
    expect(card.width).toBe(380)
    // The bubble keeps its offset within the column, scaled.
    expect(card.contentLeft).toBeCloseTo(22.8 + (200 - 16) * PREVIEW_SCALE)
  })

  it('widens to a message that overflows the column, within the screen', () => {
    const card = previewCardRect(base({ left: 0, width: 500 }))!
    expect(card.left).toBe(0)
    expect(card.width).toBe(412)
  })

  it('skips the card when there is no room', () => {
    expect(previewCardRect(base({}, { sheetTop: 130 }))).toBeUndefined()
    expect(previewCardRect(base({ height: 0 }))).toBeUndefined()
    expect(
      previewCardRect(
        base(
          {},
          {
            column: { left: 0, right: 0 },
            viewport: { width: 0, height: 900 },
          },
        ),
      ),
    ).toBeUndefined()
  })

  it('moves an unboxed message top padding above the clip', () => {
    const card = previewCardRect(base({}, { trimTop: 20 }))!
    expect(card.contentTop).toBeCloseTo(16 - 20 * PREVIEW_SCALE)
    expect(card.height).toBeCloseTo(80 * PREVIEW_SCALE + 32)
  })

  it('never trims more than the message height', () => {
    const card = previewCardRect(base({}, { trimTop: 500 }))!
    expect(card.contentTop).toBeCloseTo(16 - 100 * PREVIEW_SCALE)
    expect(card.height).toBeCloseTo(32)
  })
})

describe('previewCardFrom', () => {
  it('lays the copy over the message at full size', () => {
    const input = base({ left: 200, top: 260, width: 150 })
    const card = previewCardRect(input)!
    const from = previewCardFrom(card, input.source, input.safeTop)
    expect(from.opacity).toBe(1)
    const { x, y, scale } = parseTransform(from.transform)
    expect(scale).toBeCloseTo(1 / card.scale, 3)
    expect(card.left + x + card.contentLeft * scale).toBeCloseTo(200, 1)
    expect(card.top + y + card.contentTop * scale).toBeCloseTo(260, 1)
  })

  it('pops in place when the message top is off screen', () => {
    const input = base({ top: 10 })
    const card = previewCardRect(input)!
    const from = previewCardFrom(card, input.source, input.safeTop)
    expect(from.opacity).toBe(0)
    const { x, y, scale } = parseTransform(from.transform)
    expect(scale).toBe(0.96)
    // Shrunk about the card's centre.
    expect(x).toBeCloseTo(card.width * 0.02, 1)
    expect(y).toBeCloseTo(card.height * 0.02, 1)
  })
})
