import { useLayoutEffect, type RefObject } from 'react'
import { reducedMotionPreferred } from './useReducedMotion'

/** Mirrors `--dur-flight` / `--ease-spring` for the FLIP fallback. */
export const FLIGHT_MS = 320
export const FLIGHT_EASING = 'cubic-bezier(0.34, 1.32, 0.64, 1)'

/** Where the shared avatar sits: the tab bar or rail, or the /alma header. */
export type FlightEnd = 'nav' | 'header'

interface Box {
  left: number
  top: number
  width: number
  height: number
}

// A route change hands the avatar over within one commit; anything older is
// an unrelated navigation and must not animate.
const HANDOFF_WINDOW_MS = 600

let origin: { end: FlightEnd; box: Box; at: number } | undefined

export function recordFlightOrigin(end: FlightEnd, box: Box, at = now()) {
  origin = { end, box, at }
}

/** The other end's last position, consumed once. */
export function takeFlightOrigin(end: FlightEnd, at = now()): Box | undefined {
  const pending = origin
  if (!pending || pending.end === end) return undefined
  origin = undefined
  return at - pending.at <= HANDOFF_WINDOW_MS ? pending.box : undefined
}

export function clearFlightOrigin() {
  origin = undefined
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export type FlightMode = 'view-transition' | 'flip' | 'none'

/**
 * View Transitions morph the avatar natively (the router already wraps every
 * navigation in one). Without them we FLIP it ourselves. Reduced motion
 * gets neither: the page crossfade is the whole transition.
 */
export function flightMode({
  reduced,
  viewTransitions,
}: {
  reduced: boolean
  viewTransitions: boolean
}): FlightMode {
  if (reduced) return 'none'
  return viewTransitions ? 'view-transition' : 'flip'
}

export function supportsViewTransitions() {
  return (
    typeof document !== 'undefined' &&
    typeof (document as { startViewTransition?: unknown })
      .startViewTransition === 'function'
  )
}

/** Transform-only keyframes that carry `to` back onto `from` and release. */
export function flipKeyframes(from: Box, to: Box): Keyframe[] | undefined {
  if (!to.width || !to.height) return undefined
  const dx = from.left + from.width / 2 - (to.left + to.width / 2)
  const dy = from.top + from.height / 2 - (to.top + to.height / 2)
  const scale = from.width / to.width
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.01)
    return undefined
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    { transform: 'none' },
  ]
}

/**
 * Hands the avatar between its two ends. The leaving end records its box as
 * it unmounts (or deactivates, for the persistent rail); the arriving end
 * flies in from it when the FLIP fallback is the active mode.
 */
export function useAvatarFlight(
  ref: RefObject<HTMLElement>,
  end: FlightEnd,
  active: boolean,
) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!active || !element) return
    const from = takeFlightOrigin(end)
    const mode = flightMode({
      reduced: reducedMotionPreferred(),
      viewTransitions: supportsViewTransitions(),
    })
    if (from && mode === 'flip' && typeof element.animate === 'function') {
      const frames = flipKeyframes(from, element.getBoundingClientRect())
      if (frames)
        element.animate(frames, {
          duration: FLIGHT_MS,
          easing: FLIGHT_EASING,
        })
    }
    return () => {
      if (element.isConnected)
        recordFlightOrigin(end, element.getBoundingClientRect())
    }
  }, [active, end, ref])
}
