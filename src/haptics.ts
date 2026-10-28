import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { performNativeHaptic } from './nativeBridge'
import { isNativePlatform } from './nativeRuntime'
export function hapticsEnabled() {
  try {
    return localStorage.getItem('alma-haptics') !== 'off'
  } catch {
    return true
  }
}
export async function haptic(kind: 'light' | 'selection' | 'medium' = 'light') {
  if (!isNativePlatform() || !hapticsEnabled()) return
  try {
    await performNativeHaptic(kind)
    return
  } catch {
    // Older native wrappers do not expose the Android feedback bridge.
  }
  try {
    await Haptics.impact({
      style:
        kind === 'medium'
          ? ImpactStyle.Heavy
          : kind === 'selection'
            ? ImpactStyle.Light
            : ImpactStyle.Medium,
    })
  } catch {
    /* unavailable native plugin */
  }
}
