// Whether a composer shows its text box or the hold-to-talk bar. Each
// surface remembers its own last choice, so Alma chat can stay on voice
// while Herdr stays on the keyboard.

import type { DictationSurface } from './engineStore'

export type InputMode = 'keyboard' | 'voice'

export function inputModeKey(surface: DictationSurface): string {
  return `alma.speech.input-mode.${surface}.v1`
}

export function loadInputMode(surface: DictationSurface): InputMode {
  try {
    return localStorage.getItem(inputModeKey(surface)) === 'voice'
      ? 'voice'
      : 'keyboard'
  } catch {
    // Storage can be unavailable; the keyboard is the safe default.
    return 'keyboard'
  }
}

export function saveInputMode(surface: DictationSurface, mode: InputMode) {
  try {
    localStorage.setItem(inputModeKey(surface), mode)
  } catch {
    // Not remembering the choice only costs a tap next time.
  }
}
