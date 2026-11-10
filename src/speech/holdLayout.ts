// Geometry of the hold-to-talk overlay. The overlay draws its arc and two
// capsules from this layout, and the finger is hit-tested against the same
// shapes, so what lights up is exactly where the finger is.

export type HoldZone = 'release' | 'cancel' | 'edit'

/** A rounded capsule turned `angle` degrees clockwise about its centre. */
export interface Capsule {
  cx: number
  cy: number
  width: number
  height: number
  angle: number
}

export interface HoldLayout {
  width: number
  height: number
  /** The width the capsules and the wide bubble share. */
  band: number
  /** The bottom arc: a circle whose top edge peeks above the safe area. */
  arc: { cx: number; cy: number; r: number }
  cancel: Capsule
  edit: Capsule
  /** The bubble's bottom edge (its tail hangs below this). */
  bubbleBottom: number
}

/** Wide screens keep the capsules this close together, not stretched. */
export const MAX_BAND = 520
/** Screens narrower than this (a folded phone's cover) get smaller shapes. */
export const NARROW_WIDTH = 380
/** Forgiveness around a capsule's edge for a finger. */
export const HIT_PAD = 10
const EDGE = 12

export function holdLayout(
  width: number,
  height: number,
  safeBottom = 0,
): HoldLayout {
  const narrow = width < NARROW_WIDTH
  const band = Math.min(width - EDGE * 2, MAX_BAND)
  const arcTop = height - safeBottom - (narrow ? 96 : 112)
  const r = Math.max(width, 600) * 1.25
  const capsuleHeight = narrow ? 60 : 68
  const capsuleWidth = band * 0.47
  const capsuleY = arcTop - 36 - capsuleHeight / 2
  const offset = band / 2 - capsuleWidth / 2
  const angle = narrow ? 9 : 7
  const capsule = (cx: number, turn: number): Capsule => ({
    cx,
    cy: capsuleY,
    width: capsuleWidth,
    height: capsuleHeight,
    angle: turn,
  })
  return {
    width,
    height,
    band,
    arc: { cx: width / 2, cy: arcTop + r, r },
    // Outer ends dip, so the two capsules follow the arc below them.
    cancel: capsule(width / 2 - offset, -angle),
    edit: capsule(width / 2 + offset, angle),
    bubbleBottom: capsuleY - capsuleHeight / 2 - 72,
  }
}

/** Whether (x, y) falls on the capsule, give or take `pad`. */
export function inCapsule(
  capsule: Capsule,
  x: number,
  y: number,
  pad = HIT_PAD,
): boolean {
  // Turn the point back into the capsule's own frame.
  const radians = (capsule.angle * Math.PI) / 180
  const dx = x - capsule.cx
  const dy = y - capsule.cy
  const localX = dx * Math.cos(radians) + dy * Math.sin(radians)
  const localY = -dx * Math.sin(radians) + dy * Math.cos(radians)
  const radius = capsule.height / 2
  const reach = Math.max(0, capsule.width / 2 - radius)
  const nearestX = Math.max(-reach, Math.min(reach, localX))
  return Math.hypot(localX - nearestX, localY) <= radius + pad
}

/** Where letting go at (x, y) leads: a capsule, or anywhere else = release. */
export function zoneAt(layout: HoldLayout, x: number, y: number): HoldZone {
  if (inCapsule(layout.cancel, x, y)) return 'cancel'
  if (inCapsule(layout.edit, x, y)) return 'edit'
  return 'release'
}

/** The bubble's horizontal frame and where its tail points, per zone. */
export function bubbleFrame(
  layout: HoldLayout,
  zone: HoldZone,
): { left: number; width: number; tailX: number } {
  const centre = layout.width / 2
  if (zone === 'cancel') {
    const width = 112
    const left = Math.max(EDGE, layout.cancel.cx - width / 2)
    return { left, width, tailX: left + width / 2 }
  }
  if (zone === 'edit')
    return {
      left: centre - layout.band / 2,
      width: layout.band,
      tailX: layout.edit.cx,
    }
  const width = Math.min(240, layout.band * 0.6)
  return { left: centre - width / 2, width, tailX: centre }
}
