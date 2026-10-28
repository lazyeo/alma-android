import { useEffect, useRef, useState } from 'react'

export const PRESENCE_EXIT_MS = 180

export type PresenceState = {
  rendered: boolean
  phase: 'entering' | 'entered' | 'exiting'
}

export function usePresence(visible: boolean): PresenceState {
  const [state, setState] = useState<PresenceState>(() => ({
    rendered: visible,
    phase: visible ? 'entered' : 'exiting',
  }))
  const frameRef = useRef(0)
  const timerRef = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(frameRef.current)
    window.clearTimeout(timerRef.current)
    if (visible) {
      setState({ rendered: true, phase: 'entering' })
      frameRef.current = requestAnimationFrame(() =>
        setState({ rendered: true, phase: 'entered' }),
      )
      return
    }
    setState((current) =>
      current.rendered ? { rendered: true, phase: 'exiting' } : current,
    )
    timerRef.current = window.setTimeout(
      () => setState({ rendered: false, phase: 'exiting' }),
      PRESENCE_EXIT_MS,
    )
  }, [visible])

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(timerRef.current)
    },
    [],
  )

  return state
}

export function presenceClass(phase: PresenceState['phase']) {
  return `ui-presence ${phase}`
}
