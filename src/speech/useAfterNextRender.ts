import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs a callback once React has committed the next render. A composer's
 * send reads the text of the render it belongs to, so a voice send sets the
 * composer text first and sends from the render that has it, through the
 * composer's own send path.
 */
export function useAfterNextRender(): (callback: () => void) => void {
  const queued = useRef<() => void>()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const callback = queued.current
    queued.current = undefined
    callback?.()
  }, [tick])
  return useCallback((callback: () => void) => {
    queued.current = callback
    setTick((count) => count + 1)
  }, [])
}
