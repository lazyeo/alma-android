/**
 * Geometry of the long-press preview card (iOS context-menu style): a
 * long-pressed message is shown as a reduced copy inside a card that sits
 * between the status bar and the actions sheet, instead of a full-size lift
 * that can run off the screen and under the sheet.
 *
 * The card spans the chat's content column. The copy keeps the message's own
 * layout width and is scaled by `scale` about the column's top-left, so the
 * scale also gives the card its side padding. Long copies are clipped to the
 * card from the message's top, and `clipped` asks for the bottom fade.
 */

/** The copy's scale inside the card; also sets the card's side padding. */
export const PREVIEW_SCALE = 0.88
/** Gap kept to the status bar and to the sheet's top edge. */
export const PREVIEW_MARGIN_PX = 12
/** The card never takes more than this share of the viewport's height. */
export const PREVIEW_MAX_VIEWPORT_FRACTION = 0.4
/** Below this height there is no useful room; the card is skipped. */
export const PREVIEW_MIN_HEIGHT_PX = 72
/** Start size of a card that cannot grow out of the message. */
const PREVIEW_POP_SCALE = 0.96
const PAD_Y_MIN_PX = 8
const PAD_Y_MAX_PX = 16

export interface PreviewRectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface PreviewCardInput {
  /** The message's on-screen rect. */
  source: PreviewRectLike
  /** The content column the message sits in (the chat's own insets). */
  column: { left: number; right: number }
  viewport: { width: number; height: number }
  /** Bottom of the status bar. */
  safeTop: number
  /** Top of the actions sheet (the viewport's bottom when there is none). */
  sheetTop: number
  /**
   * Blank space at the top of an unboxed message (its own padding) that the
   * card's padding replaces; it is moved above the clip.
   */
  trimTop?: number
  scale?: number
}

export interface PreviewCard {
  left: number
  top: number
  width: number
  height: number
  scale: number
  /** Where the copy's top-left sits inside the card, before scaling. */
  contentLeft: number
  contentTop: number
  /** The copy is taller than the card: clip it and draw the bottom fade. */
  clipped: boolean
}

export function previewCardRect({
  source,
  column,
  viewport,
  safeTop,
  sheetTop,
  trimTop = 0,
  scale: preferredScale = PREVIEW_SCALE,
}: PreviewCardInput): PreviewCard | undefined {
  // Never narrower than the message itself, never wider than the screen.
  let left = Math.max(0, Math.min(column.left, source.left))
  const right = Math.min(
    viewport.width,
    Math.max(column.right, source.left + source.width),
  )
  let width = Math.max(0, right - left)
  if (width <= 0 || source.height <= 0) return undefined
  let scale = preferredScale
  if (width > viewport.width) {
    scale *= viewport.width / width
    width = viewport.width
    left = 0
  }
  const padX = (width * (1 - scale)) / 2
  const padY = Math.min(PAD_Y_MAX_PX, Math.max(PAD_Y_MIN_PX, padX))
  const trim = Math.min(Math.max(0, trimTop), source.height)
  const natural = (source.height - trim) * scale + padY * 2
  const room = sheetTop - safeTop - PREVIEW_MARGIN_PX * 2
  const maxHeight = Math.min(
    viewport.height * PREVIEW_MAX_VIEWPORT_FRACTION,
    room,
  )
  if (maxHeight < PREVIEW_MIN_HEIGHT_PX) return undefined
  const height = Math.min(natural, maxHeight)
  // Stay where the message starts when that is on screen (clamped into the
  // free band); a message whose top scrolled away gets its card right above
  // the sheet, next to its actions.
  const minTop = safeTop + PREVIEW_MARGIN_PX
  const maxTop = sheetTop - PREVIEW_MARGIN_PX - height
  const top =
    source.top < safeTop
      ? maxTop
      : Math.min(maxTop, Math.max(minTop, source.top))
  return {
    left,
    top,
    width,
    height,
    scale,
    contentLeft: padX + (source.left - left) * scale,
    contentTop: padY - trim * scale,
    clipped: natural > maxHeight + 0.5,
  }
}

/**
 * Where the card starts and ends its entry: a transform (origin top-left)
 * that lays the copy over the message at full size, so the card grows out of
 * it. When the message's top is not on screen there is nothing to grow out
 * of, and the card fades in from a slightly smaller size in place.
 */
export function previewCardFrom(
  card: PreviewCard,
  source: PreviewRectLike,
  safeTop: number,
): { transform: string; opacity: number } {
  if (source.top < safeTop) {
    // Origin is top-left; offset by half the shrink to keep it centred.
    const inset = (1 - PREVIEW_POP_SCALE) / 2
    return {
      transform: `translate(${round(card.width * inset)}px, ${round(card.height * inset)}px) scale(${PREVIEW_POP_SCALE})`,
      opacity: 0,
    }
  }
  const grow = 1 / card.scale
  const x = source.left - card.left - card.contentLeft * grow
  const y = source.top - card.top - card.contentTop * grow
  return {
    transform: `translate(${round(x)}px, ${round(y)}px) scale(${round(grow, 4)})`,
    opacity: 1,
  }
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
