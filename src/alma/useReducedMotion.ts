import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function reducedMotionPreferred() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false
}

/** Live `prefers-reduced-motion`, so idle loops stop the moment it flips. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(reducedMotionPreferred)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(QUERY)
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return reduced
}
