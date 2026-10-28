export interface NativeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface NativeInsetState {
  insets: NativeInsets
  padding: NativeInsets
}

const LEGACY_FULLSCREEN_STORAGE_KEY = 'alma-mobile.fullscreen.v1'
const zeroInsets: NativeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

declare global {
  interface Window {
    __almaNativeInsets?: NativeInsets
    __almaNativePadding?: NativeInsets
    __almaSetNativeInsets?: (
      insets: NativeInsets,
      padding?: NativeInsets,
      _legacyFullscreen?: boolean,
    ) => NativeInsetState
  }
}

const sides = ['top', 'right', 'bottom', 'left'] as const

export function normalizeNativeInsets(insets: NativeInsets): NativeInsets {
  return Object.fromEntries(
    sides.map((side) => {
      const value = insets[side]
      return [side, Number.isFinite(value) && value > 0 ? value : 0]
    }),
  ) as unknown as NativeInsets
}

export function applyNativeInsets(
  insets: NativeInsets,
  padding: NativeInsets = zeroInsets,
  root: HTMLElement = document.documentElement,
): NativeInsetState {
  const normalized = normalizeNativeInsets(insets)
  const normalizedPadding = normalizeNativeInsets(padding)
  for (const side of sides)
    root.style.setProperty(`--native-safe-${side}`, `${normalized[side]}px`)
  window.__almaNativeInsets = normalized
  window.__almaNativePadding = normalizedPadding
  const detail = { insets: normalized, padding: normalizedPadding }
  window.dispatchEvent(
    new CustomEvent<NativeInsetState>('alma-native-insets', { detail }),
  )
  return detail
}

export function installNativeInsetsBridge() {
  localStorage.removeItem(LEGACY_FULLSCREEN_STORAGE_KEY)
  window.__almaSetNativeInsets = (insets, padding) =>
    applyNativeInsets(
      insets,
      padding ?? window.__almaNativePadding ?? zeroInsets,
    )
  applyNativeInsets(
    window.__almaNativeInsets ?? zeroInsets,
    window.__almaNativePadding ?? zeroInsets,
  )
}
