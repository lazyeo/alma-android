/**
 * The whole-screen expand into /alma: her conversation grows as a circle out
 * of the avatar disc while the page behind recedes, and Back collapses it
 * into the disc again. The router decides *that* Alma is entered or left;
 * this module decides where the circle starts and which variant runs.
 */

/** Mirrors `--dur-expand` for the timed FLIP fallback cleanup. */
export const EXPAND_MS = 420

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface ExpandOrigin {
  /** Disc centre in viewport pixels. */
  x: number
  y: number
  /** Radius that covers the farthest viewport corner from the centre. */
  radius: number
}

export type ExpandDirection = 'open' | 'close'

/**
 * - `reveal`: View Transitions clip the new page to a growing circle (or the
 *   old one to a shrinking circle) with the avatar as a shared element.
 * - `flip`: no View Transitions; the arriving page reveals itself with the
 *   same circle and the avatar FLIPs (see avatarFlight).
 * - `crossfade`: reduced motion, or no disc to grow from.
 */
export type ExpandMode = 'reveal' | 'flip' | 'crossfade'

/** Circle origin for a disc box; the radius always reaches every corner. */
export function expandOrigin(disc: Box, viewport: Viewport): ExpandOrigin {
  const x = disc.left + disc.width / 2
  const y = disc.top + disc.height / 2
  const dx = Math.max(x, viewport.width - x)
  const dy = Math.max(y, viewport.height - y)
  return { x, y, radius: Math.ceil(Math.hypot(dx, dy)) }
}

export function expandMode({
  reduced,
  viewTransitions,
  hasOrigin,
}: {
  reduced: boolean
  viewTransitions: boolean
  hasOrigin: boolean
}): ExpandMode {
  if (reduced || !hasOrigin) return 'crossfade'
  return viewTransitions ? 'reveal' : 'flip'
}

// The disc's last on-screen box. Open records it on tap; close reuses it so
// the circle shrinks back into the same disc the user left from.
let disc: Box | undefined

export function recordExpandDisc(box: Box) {
  disc = box.width && box.height ? box : undefined
}

export function lastExpandDisc() {
  return disc
}

export function clearExpandDisc() {
  disc = undefined
}

const ATTRIBUTE = 'data-alma-expand'
const VARIABLES = ['--alma-expand-x', '--alma-expand-y', '--alma-expand-r']

/**
 * Publishes the origin as CSS variables and marks the direction on <html>;
 * styles.css keys the reveal, recede and stagger off them. Returns the mode
 * so the caller knows whether a View Transition or the fallback carries it.
 */
export function applyExpand(
  direction: ExpandDirection,
  options: { reduced: boolean; viewTransitions: boolean },
  root: HTMLElement = document.documentElement,
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): ExpandMode {
  const box = lastExpandDisc()
  const mode = expandMode({ ...options, hasOrigin: Boolean(box) })
  if (mode === 'crossfade' || !box) {
    clearExpand(root)
    return mode
  }
  const origin = expandOrigin(box, viewport)
  root.style.setProperty(VARIABLES[0], `${origin.x}px`)
  root.style.setProperty(VARIABLES[1], `${origin.y}px`)
  root.style.setProperty(VARIABLES[2], `${origin.radius}px`)
  root.setAttribute(ATTRIBUTE, `${direction}-${mode}`)
  return mode
}

export function clearExpand(root: HTMLElement = document.documentElement) {
  root.removeAttribute(ATTRIBUTE)
  for (const name of VARIABLES) root.style.removeProperty(name)
}
