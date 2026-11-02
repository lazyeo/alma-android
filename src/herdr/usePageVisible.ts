import { useSyncExternalStore } from 'react'

function subscribe(listener: () => void) {
  if (typeof document === 'undefined') return () => undefined
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

function getSnapshot() {
  return (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  )
}

export function usePageVisible() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
