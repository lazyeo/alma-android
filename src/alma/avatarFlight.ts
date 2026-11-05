/**
 * The avatar's flight between the tab bar (or rail) disc and the /alma
 * header during the expand and collapse. A fixed-position clone of her face
 * flies with a WAAPI transform, so the compositor carries it even while the
 * main thread renders the destination; both real avatars stay hidden
 * (`data-alma-avatar-flight` on <html>) until it lands, so there is never a
 * double avatar. Every box it needs is measured ahead of time
 * (`useMeasuredBox`), never in the tap.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the avatar sits: the tab bar or rail, or the /alma header (on
 * split layouts her face docked across the rail edge stands in for it).
 */
export type AvatarEnd = 'nav' | 'header'

/** Marks each end's real avatar; the clone copies it. */
export const AVATAR_END_ATTRIBUTE = 'data-alma-avatar'
/** On <html> while a clone flies: hides every `.alma-avatar-flight`. */
export const AVATAR_FLIGHT_ATTRIBUTE = 'data-alma-avatar-flight'

const boxes: Partial<Record<AvatarEnd, Box>> = {}

export function recordAvatarBox(end: AvatarEnd, box: Box) {
  if (box.width && box.height)
    boxes[end] = {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    }
}

export function avatarBox(end: AvatarEnd): Box | undefined {
  return boxes[end]
}

export function clearAvatarBoxes() {
  delete boxes.nav
  delete boxes.header
}

/** Mirrors `.detail-main` (18px inline padding around the phone page). */
const DETAIL_MAIN_INLINE_PX = 18
/** Mirrors `.detail-header` (60px bar, 12px inline padding, 40px back button). */
const HEADER_BAR_PX = 60
const HEADER_INLINE_PX = 12
const HEADER_BACK_PX = 40
/** Mirrors `.detail-header.alma-header` gap and `.alma-header > .alma-avatar`. */
const HEADER_GAP_PX = 10
export const HEADER_AVATAR_PX = 36

/**
 * The phone header avatar's box from the layout tokens, for the first open
 * before the header has ever been measured.
 */
export function predictedHeaderAvatar(
  insets: { top: number; left: number } = { top: 0, left: 0 },
): Box {
  return {
    left:
      DETAIL_MAIN_INLINE_PX +
      Math.max(HEADER_INLINE_PX, insets.left) +
      HEADER_BACK_PX +
      HEADER_GAP_PX,
    top: insets.top + (HEADER_BAR_PX - HEADER_AVATAR_PX) / 2,
    width: HEADER_AVATAR_PX,
    height: HEADER_AVATAR_PX,
  }
}

/** Her docked face on split layouts (`.alma-dock`), clearly over the 40px rail face. */
export const DOCK_AVATAR_PX = 52

/**
 * On split layouts /alma has one face, docked across the rail's right
 * edge and centred on the 60px header row below the safe top (mirrors
 * `.alma-dock`). `rail` is the rail's box and its top padding (the safe top).
 */
export function predictedDockAvatar(rail: {
  right: number
  top: number
  paddingTop: number
}): Box {
  return {
    left: rail.right - DOCK_AVATAR_PX / 2,
    top: rail.top + rail.paddingTop + (HEADER_BAR_PX - DOCK_AVATAR_PX) / 2,
    width: DOCK_AVATAR_PX,
    height: DOCK_AVATAR_PX,
  }
}

/** The header's last measured box, or the token prediction. */
export function headerAvatarTarget(): Box {
  if (boxes.header) return boxes.header
  const insets = (
    window as { __almaNativeInsets?: { top: number; left: number } }
  ).__almaNativeInsets
  return predictedHeaderAvatar(insets)
}

/**
 * Transform-only flight for a clone laid out at `from` (left/top 0, its
 * own size, origin 0 0): it starts unscaled on `from` and lands on `to`.
 */
export function flightFrames(from: Box, to: Box): Keyframe[] | undefined {
  if (!from.width || !to.width) return undefined
  return [
    { transform: `translate(${from.left}px, ${from.top}px)` },
    {
      transform: `translate(${to.left}px, ${to.top}px) scale(${round(to.width / from.width)})`,
    },
  ]
}

/**
 * The farthest any corner of the face moves between `from` and `to`: a
 * progress overshoot of `o` carries that corner `o` times this past its
 * landing, since translate and scale both interpolate with progress.
 */
export function flightTravel(from: Box, to: Box) {
  const corners = (box: Box) => [
    [box.left, box.top],
    [box.left + box.width, box.top],
    [box.left, box.top + box.height],
    [box.left + box.width, box.top + box.height],
  ]
  const end = corners(to)
  return Math.max(
    ...corners(from).map(([x, y], index) =>
      Math.hypot(end[index][0] - x, end[index][1] - y),
    ),
  )
}

/**
 * Nudges a flight already in the air onto the real landing box once it is
 * known, on the clone's inner layer. The outer layer ends at `endScale`,
 * so the nudge is in its scaled coordinates.
 */
export function correctionFrames(
  predicted: Box,
  actual: Box,
  endScale: number,
): Keyframe[] | undefined {
  const dx = actual.left - predicted.left
  const dy = actual.top - predicted.top
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return undefined
  const s = endScale || 1
  return [
    { transform: 'translate(0px, 0px)' },
    { transform: `translate(${round(dx / s)}px, ${round(dy / s)}px)` },
  ]
}

const round = (value: number) => Number(value.toFixed(4))

/**
 * A fixed overlay copy of one end's avatar: the element tree is cloned and
 * each canvas (the mascot rig) is copied pixel for pixel, so the clone
 * shows exactly the face that was on screen.
 */
export function avatarClone(source: Element | null, box: Box) {
  const flight = document.createElement('div')
  flight.className = 'alma-avatar-clone'
  flight.setAttribute('aria-hidden', 'true')
  flight.style.width = `${box.width}px`
  flight.style.height = `${box.height}px`
  const face = document.createElement('div')
  face.className = 'alma-avatar-clone-face'
  flight.append(face)
  if (source) {
    const copy = source.cloneNode(true) as HTMLElement
    copy.classList.remove('alma-avatar-flight')
    copy.removeAttribute(AVATAR_END_ATTRIBUTE)
    copy.removeAttribute('id')
    const sources = source.querySelectorAll('canvas')
    copy.querySelectorAll('canvas').forEach((canvas, index) => {
      const original = sources[index]
      if (!original) return
      canvas.width = original.width
      canvas.height = original.height
      canvas.getContext('2d')?.drawImage(original, 0, 0)
    })
    face.append(copy)
  }
  return { flight, face }
}

export function avatarElement(end: AvatarEnd) {
  return document.querySelector(`[${AVATAR_END_ATTRIBUTE}="${end}"]`)
}
