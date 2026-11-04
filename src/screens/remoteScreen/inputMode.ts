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
