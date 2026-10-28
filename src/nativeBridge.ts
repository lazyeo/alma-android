import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'
import type { SharePayload } from './share/shareLogic'
import { App as CapacitorApp } from '@capacitor/app'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { FoldTransitionNativeConfig } from './foldTransition'
import { isAndroidNative, isNativePlatform } from './nativeRuntime'

const ThemeChrome = registerPlugin<{
  apply(options: { color: string; dark: boolean }): Promise<void>
  haptic(options: { kind: 'selection' | 'light' | 'medium' }): Promise<void>
  setSelectionActions(options: { enabled: boolean }): Promise<void>
}>('ThemeChrome')

export type FoldAngleSourceState = {
  source: 'shizuku' | 'estimated'
  shizukuRunning: boolean
  permission:
    'granted' | 'denied' | 'requested' | 'not_requested' | 'unavailable'
}

const ShareIntake = registerPlugin<{
  getPendingShare(): Promise<SharePayload>
  consumePendingShare(): Promise<void>
  updateShortcuts(options: {
    shortcuts: Array<{
      id: string
      label: string
      desktopName: string
    }>
    activeDesktopIds: string[]
  }): Promise<void>
  reportShortcutUsed(options: { id: string }): Promise<void>
  addListener(
    eventName: 'shareReceived',
    listener: (payload: SharePayload) => void,
  ): Promise<PluginListenerHandle>
}>('ShareIntake')

const FileHandoff = registerPlugin<{
  begin(options: {
    name: string
    mimeType: string
    size: number
  }): Promise<{ token: string }>
  append(options: { token: string; base64: string }): Promise<void>
  finish(options: { token: string; open?: boolean }): Promise<void>
  share(options: { token: string }): Promise<void>
  save(options: { token: string }): Promise<void>
  openExternal(options: { url: string }): Promise<void>
}>('FileHandoff')

const FoldTransition = registerPlugin<{
  configure(options: FoldTransitionNativeConfig): Promise<void>
  preview(options: {
    direction: 'open' | 'close'
  }): Promise<{ durationMs: number }>
  getAngleSource(): Promise<FoldAngleSourceState>
  requestShizukuPermission(): Promise<FoldAngleSourceState>
}>('FoldTransition')

export const beginNativeFile = (options: {
  name: string
  mimeType: string
  size: number
}) => FileHandoff.begin(options)

export const appendNativeFileChunk = (options: {
  token: string
  base64: string
}) => FileHandoff.append(options)

export const finishNativeFile = (options: { token: string; open?: boolean }) =>
  FileHandoff.finish(options)

export const shareNativeFile = (options: { token: string }) =>
  FileHandoff.share(options)

export const saveNativeFile = (options: { token: string }) =>
  FileHandoff.save(options)

export async function openExternalUrl(url: string) {
  if (isNativePlatform()) await FileHandoff.openExternal({ url })
  else window.open(url, '_blank', 'noopener,noreferrer')
}

// APKs built before the plugin existed reject with UNIMPLEMENTED, and devices
// below Android 13 reject the preview with UNAVAILABLE; both are the same
// "nothing to drive" case as the web build, not a failure to report.
const foldUnavailableCodes = new Set(['UNIMPLEMENTED', 'UNAVAILABLE'])

async function callFoldTransition(call: () => Promise<unknown>) {
  if (!isAndroidNative()) return false
  try {
    await call()
    return true
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code && foldUnavailableCodes.has(code)) return false
    throw error
  }
}

/** Resolves false when there is no native fold plugin to configure. */
export function configureNativeFoldTransition(
  config: FoldTransitionNativeConfig,
) {
  return callFoldTransition(() => FoldTransition.configure(config))
}

/** Plays one native fold direction; resolves false when unavailable. */
export function previewNativeFoldTransition(direction: 'open' | 'close') {
  return callFoldTransition(() => FoldTransition.preview({ direction }))
}

export async function getNativeFoldAngleSource() {
  if (!isAndroidNative()) return undefined
  try {
    return await FoldTransition.getAngleSource()
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code && foldUnavailableCodes.has(code)) return undefined
    throw error
  }
}

export async function requestNativeShizukuPermission() {
  if (!isAndroidNative()) return undefined
  try {
    return await FoldTransition.requestShizukuPermission()
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code && foldUnavailableCodes.has(code)) return undefined
    throw error
  }
}

export async function getNativePendingShare() {
  if (!isAndroidNative()) return undefined
  return ShareIntake.getPendingShare().catch(() => undefined)
}

export async function consumeNativePendingShare() {
  if (isAndroidNative()) await ShareIntake.consumePendingShare()
}

export async function subscribeNativeShares(
  listener: (payload: SharePayload) => void,
) {
  if (!isAndroidNative()) return () => undefined
  const handle = await ShareIntake.addListener('shareReceived', listener)
  return () => void handle.remove()
}

export async function updateNativeShareShortcuts(options: {
  shortcuts: Array<{ id: string; label: string; desktopName: string }>
  activeDesktopIds: string[]
}) {
  if (isAndroidNative()) await ShareIntake.updateShortcuts(options)
}

export async function reportNativeShareShortcutUsed(id: string | undefined) {
  if (isAndroidNative() && id) await ShareIntake.reportShortcutUsed({ id })
}

/** WebView-loadable URL for a shared file; raw native paths do not load in <img>. */
export function shareFileSrc(file: { dataUrl?: string; path?: string }) {
  if (file.dataUrl) return file.dataUrl
  return file.path ? Capacitor.convertFileSrc(file.path) : undefined
}

export async function readNativeShareFile(path: string) {
  const response = await fetch(Capacitor.convertFileSrc(path))
  if (!response.ok) throw new Error('Could not open the shared file.')
  return new Uint8Array(await response.arrayBuffer())
}

/** Adds Quote/Mention to the system selection toolbar while enabled. */
export async function setNativeSelectionActions(enabled: boolean) {
  if (isNativePlatform())
    await ThemeChrome.setSelectionActions({ enabled }).catch(() => undefined)
}

export async function performNativeHaptic(
  kind: 'selection' | 'light' | 'medium',
) {
  await ThemeChrome.haptic({ kind })
}

// Capacitor names the style by the background it suits: Style.Dark gives
// light icons for a dark theme, Style.Light gives dark icons for a light one.
export function nativeStatusBarStyle(dark: boolean) {
  return dark ? Style.Dark : Style.Light
}

export async function configureNativeChrome(color = '#333748', dark = true) {
  if (!isNativePlatform()) return
  await Promise.allSettled([
    ThemeChrome.apply({ color, dark }),
    StatusBar.setBackgroundColor({ color }),
    StatusBar.setStyle({ style: nativeStatusBarStyle(dark) }),
    StatusBar.setOverlaysWebView({ overlay: true }),
    Keyboard.setResizeMode({ mode: KeyboardResize.Native }),
  ])
}

/**
 * The launch URL stays readable for the whole process lifetime, so it is read
 * once; re-subscribing (route changes, StrictMode) must not replay it.
 */
let launchUrlChecked = false

export async function subscribeNativeAppEvents(input: {
  onUrl(url: string): void
  onBack(): void
}) {
  if (!isNativePlatform()) return () => undefined

  const [urlListener, backListener] = await Promise.all([
    CapacitorApp.addListener('appUrlOpen', ({ url }) => input.onUrl(url)),
    CapacitorApp.addListener('backButton', input.onBack),
  ])
  if (!launchUrlChecked) {
    launchUrlChecked = true
    const launch = await CapacitorApp.getLaunchUrl()
    if (launch?.url) input.onUrl(launch.url)
  }

  return () => {
    void urlListener.remove()
    void backListener.remove()
  }
}

export async function exitNativeApp() {
  if (isNativePlatform()) await CapacitorApp.exitApp()
}
