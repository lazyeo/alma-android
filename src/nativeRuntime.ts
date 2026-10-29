import { Capacitor } from '@capacitor/core'

export const isNativePlatform = () => Capacitor.isNativePlatform()

/** getPlatform() is 'web' outside the APK, so this also implies native. */
export const isAndroidNative = () => Capacitor.getPlatform() === 'android'

export function shouldRegisterServiceWorker(native: boolean) {
  return !native
}

export function notificationId(tag: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 2_147_483_647 || 1
}

export function notificationDestination(url: string | undefined) {
  if (/^\/d\/[^/]+\/(?:threads\/[^/]+|agents\/[^/]+)(?:\/|$)/.test(url ?? ''))
    return url!
  return '/threads'
}
