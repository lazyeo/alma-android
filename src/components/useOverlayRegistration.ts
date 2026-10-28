import { useEffect, useRef } from 'react'
import { registerOverlay } from '../overlayStack'

export function useOverlayRegistration(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    return registerOverlay(() => closeRef.current())
  }, [open])
}
