import { describe, expect, it } from 'vitest'
import {
  PREVIEW_MARGIN_PX,
  PREVIEW_MAX_VIEWPORT_FRACTION,
  PREVIEW_SCALE,
  previewCardFrom,
  previewCardRect,
  previewTail,
  previewTailAttributes,
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

describe('previewTail', () => {
  const text = (value: string) => ({ type: 'text', text: value })
  const tool = { type: 'tool-bash', state: 'output-available' }
  const thinking = { type: 'reasoning', text: 'Considering it.' }
  const step = { type: 'step-start' }

  it('shows the summary after the thinking and tool rows', () => {
    expect(
      previewTail([
        step,
        thinking,
        tool,
        tool,
        step,
        text('Done.'),
        text('Table'),
      ]),
    ).toEqual({ parts: [5, 6], skipped: 3 })
  })

  it('counts earlier text among the skipped steps', () => {
    expect(previewTail([text('Checking.'), tool, text('All good.')])).toEqual({
      parts: [2],
      skipped: 2,
    })
  })

  it('falls back to the last non-empty text when the reply ends on a tool', () => {
    expect(
      previewTail([thinking, text('Running it.'), tool, text('  ')]),
    ).toEqual({ parts: [1], skipped: 1 })
    expect(previewTail([text('First.'), tool])).toEqual({
      parts: [0],
      skipped: 0,
    })
  })

  it('keeps the whole message without tool or thinking parts', () => {
    expect(previewTail([text('Hello'), text('There')])).toBeUndefined()
    expect(previewTailAttributes([step, text('Hello')])).toEqual({})
  })

  it('keeps the whole message when there is no text at all', () => {
    expect(previewTail([])).toBeUndefined()
    expect(previewTail([thinking, tool, text('')])).toBeUndefined()
  })

  it('skips blank text inside the summary run', () => {
    expect(
      previewTail([tool, text(''), text('Summary'), step, text('More')]),
    ).toEqual({ parts: [2, 4], skipped: 1 })
    expect(previewTailAttributes([tool, text('Summary')])).toEqual({
      'data-preview-parts': '1',
      'data-preview-skipped': '1',
    })
  })
})

describe('summary cards', () => {
  it('reserves the hint row above the copy', () => {
    const plain = previewCardRect(base())!
    const card = previewCardRect(base({}, { lead: 24 }))!
    expect(card.height).toBeCloseTo(plain.height + 24)
    expect(card.contentTop).toBeCloseTo(plain.contentTop + 24)
    expect(card.leadTop).toBe(plain.contentTop)
    expect(card.leadLeft).toBeCloseTo(plain.contentLeft)
  })

  it('pops in right above the sheet when earlier parts were skipped', () => {
    const card = previewCardRect(base({}, { lead: 24, pop: true }))!
    expect(card.pop).toBe(true)
    expect(card.top + card.height).toBeCloseTo(600 - PREVIEW_MARGIN_PX)
    const from = previewCardFrom(card, base().source, 40)
    expect(from.opacity).toBe(0)
    expect(from.transform).toContain('scale(0.96)')
  })

  it('still grows out of the message when nothing before was skipped', () => {
    const card = previewCardRect(base())!
    expect(card.pop).toBe(false)
    const from = previewCardFrom(card, base().source, 40)
    expect(from.opacity).toBe(1)
    expect(parseTransform(from.transform).scale).toBeGreaterThan(1)
  })

  it('starts a tall summary at its top and fades the bottom', () => {
    const card = previewCardRect(
      base({ height: 1200 }, { lead: 24, pop: true }),
    )!
    expect(card.clipped).toBe(true)
    expect(card.contentTop).toBe(card.leadTop + 24)
  })
})
