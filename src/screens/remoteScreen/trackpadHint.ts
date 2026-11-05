// The trackpad hint at the foot of the screen fades after the first touch.
// (An older per-desktop `alma.screen.inputMode.*` value from when Direct mode
// existed is no longer read: control is always the trackpad.)

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
