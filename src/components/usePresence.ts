import { useEffect, useRef, useState } from 'react'
import { FADE_EXIT_MS } from '../motionTokens'

export const PRESENCE_EXIT_MS = FADE_EXIT_MS

export type PresenceState = {
  rendered: boolean
  phase: 'entering' | 'entered' | 'exiting'
}

export type PresenceOptions = {
  /** How long the exit runs before the element unmounts. */
  exitMs?: number
  /** Play the entrance when the element mounts already visible. */
  appear?: boolean
}

export function nextPresence(
  current: PresenceState,
  visible: boolean,
): PresenceState {
  if (!visible)
    return current.rendered ? { rendered: true, phase: 'exiting' } : current
  if (!current.rendered) return { rendered: true, phase: 'entering' }
  // Shown again mid-exit: retarget from where it is, never dip to the start.
  if (current.phase === 'exiting') return { rendered: true, phase: 'entered' }
  return current
}

/**
 * Keeps a conditional element mounted through its exit and gives it a
 * painted `entering` frame before `entered`, so its CSS transition always
 * has a start state. A surface on screen when its owner mounts starts
 * `entered` (the page opens finished) unless `appear` asks for the entrance.
 */
export function usePresence(
  visible: boolean,
  { exitMs = PRESENCE_EXIT_MS, appear = false }: PresenceOptions = {},
): PresenceState {
  const [state, setState] = useState<PresenceState>(() => ({
    rendered: visible,
    phase: visible ? (appear ? 'entering' : 'entered') : 'exiting',
  }))
  const previous = useRef(visible)

  useEffect(() => {
    if (previous.current === visible) return
    previous.current = visible
    setState((current) => nextPresence(current, visible))
  }, [visible])

  useEffect(() => {
    if (!state.rendered || state.phase !== 'entering') return
    // Two frames: the first paints `entering`, the second starts the
    // transition from it.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        setState((current) =>
          current.rendered && current.phase === 'entering'
            ? { rendered: true, phase: 'entered' }
            : current,
        ),
      )
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [state.rendered, state.phase])

  useEffect(() => {
    if (!state.rendered || state.phase !== 'exiting') return
    const timer = window.setTimeout(
      () =>
        setState((current) =>
          current.phase === 'exiting'
            ? { rendered: false, phase: 'exiting' }
            : current,
        ),
      exitMs,
    )
    return () => window.clearTimeout(timer)
  }, [state.rendered, state.phase, exitMs])

  return state
}

export function presenceClass(phase: PresenceState['phase']) {
  return `ui-presence ${phase}`
}
