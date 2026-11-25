// A tap on the empty composer box no longer reaches the WebView (the box
// cancels the touch to keep its long press), so focus, and with it the soft
// keyboard, is raised here.
import { Keyboard } from '@capacitor/keyboard'
import { isNativePlatform } from '../nativeRuntime'

/** How long focus gets to raise the keyboard before it is asked directly. */
export const KEYBOARD_GRACE_MS = 400

/**
 * Focuses the box for typing. In the app, should the keyboard not start
 * showing within the grace period (focus from script is not always taken
 * as the user's), it is shown through the native plugin.
 */
export function focusToType(box: HTMLTextAreaElement): void {
  box.focus()
  if (!isNativePlatform()) return
  let shown = false
  const listening = Keyboard.addListener('keyboardWillShow', () => {
    shown = true
  })
  window.setTimeout(() => {
    void listening.then((handle) => handle.remove())
    if (shown || document.activeElement !== box) return
    Keyboard.show().catch((error: unknown) => {
      console.warn('[speech] could not show the keyboard', error)
    })
  }, KEYBOARD_GRACE_MS)
}
