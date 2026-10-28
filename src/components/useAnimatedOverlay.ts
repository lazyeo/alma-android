import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceOverlayClosing,
  initialOverlayClosingState,
} from '../overlayClosing'
import { useOverlayRegistration } from './useOverlayRegistration'

export const OVERLAY_EXIT_FALLBACK_MS = 320

export function useAnimatedOverlay(open: boolean, onClose: () => void) {
  const [state, setState] = useState(() => initialOverlayClosingState(open))
  const stateRef = useRef(state)
  const closeRef = useRef(onClose)
  const timerRef = useRef(0)
  stateRef.current = state
  closeRef.current = onClose

  const finishClose = useCallback(() => {
    if (stateRef.current.phase !== 'closing') return
    window.clearTimeout(timerRef.current)
    const next = advanceOverlayClosing(stateRef.current, {
      type: 'finish-close',
    })
    stateRef.current = next
    setState(next)
    closeRef.current()
  }, [])

  const requestClose = useCallback(() => {
    if (stateRef.current.phase !== 'open') return
    const next = advanceOverlayClosing(stateRef.current, {
      type: 'request-close',
    })
    stateRef.current = next
    setState(next)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(finishClose, OVERLAY_EXIT_FALLBACK_MS)
  }, [finishClose])

  useEffect(() => {
    if (!open) return
    window.clearTimeout(timerRef.current)
    const next = advanceOverlayClosing(stateRef.current, { type: 'open' })
    stateRef.current = next
    setState(next)
  }, [open])

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
    },
    [],
  )

  useOverlayRegistration(state.rendered, requestClose)

  return {
    rendered: state.rendered,
    closing: state.phase === 'closing',
    requestClose,
    finishClose,
  }
}
