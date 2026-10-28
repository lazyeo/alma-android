import { Style } from '@capacitor/status-bar'
import { describe, expect, it } from 'vitest'
import { nativeStatusBarStyle } from './nativeBridge'

describe('native status bar icons', () => {
  it('uses light icons on dark themes and dark icons on light themes', () => {
    expect(nativeStatusBarStyle(true)).toBe(Style.Dark)
    expect(nativeStatusBarStyle(false)).toBe(Style.Light)
  })
})
