import { useEffect, useState } from 'react'
import { Keyboard } from '@capacitor/keyboard'
import { isNativePlatform } from '../nativeRuntime'

/** Text entry that raises the soft keyboard on a phone. */
export function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return !target.readOnly
  if (!(target instanceof HTMLInputElement) || target.readOnly) return false
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(target.type)
}

/**
 * Whether the soft keyboard is up, so floating chrome can step aside. The
 * app reads the native keyboard events; the web falls back to focus in a
 * text field, which on a touch screen is what raises the keyboard.
 */
export function useSoftKeyboardOpen() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isNativePlatform()) {
      let disposed = false
      const handles: Array<{ remove(): Promise<void> }> = []
      void Promise.all([
        Keyboard.addListener('keyboardWillShow', () => setOpen(true)),
        Keyboard.addListener('keyboardWillHide', () => setOpen(false)),
      ]).then((added) => {
        if (disposed) added.forEach((handle) => void handle.remove())
        else handles.push(...added)
      })
      return () => {
        disposed = true
        handles.forEach((handle) => void handle.remove())
      }
    }
    const sync = () => setOpen(isTextEntry(document.activeElement))
    // focusout fires before focus lands on the next field.
    const onFocusOut = () => window.setTimeout(sync, 0)
    sync()
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return open
}
