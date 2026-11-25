import { useCallback, useEffect, useState } from 'react'

/**
 * "Show hidden threads" is a per-device view preference, off by default:
 * the lists stay about the conversations you started unless you ask.
 */
export const SHOW_HIDDEN_THREADS_KEY = 'alma-mobile.show-hidden-threads.v1'
// Threads and GTD can be mounted side by side (split layout); both follow.
const CHANGE_EVENT = 'alma-mobile:show-hidden-threads-change'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): PreferenceStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function loadShowHiddenThreads(
  storage: PreferenceStorage | undefined = browserStorage(),
): boolean {
  try {
    return storage?.getItem(SHOW_HIDDEN_THREADS_KEY) === '1'
  } catch {
    return false
  }
}

/** Returns false when the choice could not be stored (it still applies). */
export function saveShowHiddenThreads(
  show: boolean,
  storage: PreferenceStorage | undefined = browserStorage(),
): boolean {
  try {
    if (!storage) return false
    storage.setItem(SHOW_HIDDEN_THREADS_KEY, show ? '1' : '0')
    return true
  } catch {
    return false
  }
}

export function useShowHiddenThreads(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(() => loadShowHiddenThreads())
  useEffect(() => {
    // The event carries the value, so a store that refused it still syncs.
    const changed = (event: Event) =>
      setShow(Boolean((event as CustomEvent<boolean>).detail))
    const stored = () => setShow(loadShowHiddenThreads())
    window.addEventListener(CHANGE_EVENT, changed)
    window.addEventListener('storage', stored)
    return () => {
      window.removeEventListener(CHANGE_EVENT, changed)
      window.removeEventListener('storage', stored)
    }
  }, [])
  const update = useCallback((next: boolean) => {
    // A blocked store only costs remembering it; this session still follows.
    saveShowHiddenThreads(next)
    setShow(next)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
  }, [])
  return [show, update]
}
