export type InputMode = 'direct' | 'trackpad'

const storageKey = (desktopId: string) => `alma.screen.inputMode.${desktopId}`

/** The input mode last used with this desktop; direct touch by default. */
export function recallInputMode(desktopId: string): InputMode {
  try {
    return localStorage.getItem(storageKey(desktopId)) === 'trackpad'
      ? 'trackpad'
      : 'direct'
  } catch {
    return 'direct'
  }
}

export function rememberInputMode(desktopId: string, mode: InputMode) {
  try {
    localStorage.setItem(storageKey(desktopId), mode)
  } catch {
    // Storage is best effort.
  }
}

const HINT_KEY = 'alma.screen.trackpadHintSeen'

/** Whether the trackpad hint has been used once, on any desktop. */
export function recallTrackpadHintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberTrackpadHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    // Storage is best effort.
  }
}
