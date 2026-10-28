export interface MenuRect {
  left: number
  right: number
  top: number
  bottom: number
}

/** Slack beyond which a trigger counts as wider than what it shows. */
const CONTENT_SLACK = 48

/**
 * Full-width triggers (a header subtitle, the desktop strip) show their
 * content in only part of the box; aligning to the box edge would push the
 * menu away from what was tapped. Narrows the anchor to the content when the
 * trigger is clearly wider than it.
 */
export function narrowAnchorToContent(
  trigger: MenuRect,
  children: MenuRect[],
): MenuRect {
  const visible = children.filter((child) => child.right > child.left)
  if (!visible.length) return trigger
  const left = Math.min(...visible.map((child) => child.left))
  const right = Math.max(...visible.map((child) => child.right))
  if (trigger.right - trigger.left - (right - left) < CONTENT_SLACK)
    return trigger
  return { ...trigger, left, right }
}

export interface MenuSize {
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface AnchoredMenuPlacement {
  left: number
  top: number
  placement: 'above' | 'below'
  originX: 'left' | 'right'
}

const OFFSET = 4
const DEFAULT_MARGIN = 8

export function placeAnchoredMenu(
  anchor: MenuRect,
  menu: MenuSize,
  viewport: ViewportSize,
  insets: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 },
): AnchoredMenuPlacement {
  const minLeft = Math.max(DEFAULT_MARGIN, insets.left)
  const maxRight = viewport.width - Math.max(DEFAULT_MARGIN, insets.right)
  const minTop = Math.max(DEFAULT_MARGIN, insets.top)
  const maxBottom = viewport.height - Math.max(DEFAULT_MARGIN, insets.bottom)
  const spaceBelow = maxBottom - anchor.bottom
  const spaceAbove = anchor.top - minTop
  const placement =
    spaceBelow >= menu.height + OFFSET || spaceBelow >= spaceAbove
      ? 'below'
      : 'above'
  const alignRight = anchor.right > viewport.width / 2
  const desiredLeft = alignRight ? anchor.right - menu.width : anchor.left
  const left = Math.min(
    Math.max(desiredLeft, minLeft),
    Math.max(minLeft, maxRight - menu.width),
  )
  const desiredTop =
    placement === 'below'
      ? anchor.bottom + OFFSET
      : anchor.top - menu.height - OFFSET
  const top = Math.min(
    Math.max(desiredTop, minTop),
    Math.max(minTop, maxBottom - menu.height),
  )
  return {
    left,
    top,
    placement,
    originX: alignRight ? 'right' : 'left',
  }
}

/** A menu with no rows and no header would open as an empty shell. */
export function anchoredMenuHasContent(itemCount: number, hasHeader: boolean) {
  return itemCount > 0 || hasHeader
}
