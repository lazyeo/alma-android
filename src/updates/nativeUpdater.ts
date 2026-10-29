import { App } from '@capacitor/app'
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'
import { buildInfo } from '../buildInfo'
import { parseBuildInfo, type ReleaseApk } from './updateModel'

export type InstallStatus = 'started' | 'permissionRequired'
export type InstallStatusEvent = {
  version: string
  status: 'started' | 'permissionDenied' | 'failed'
}

const AppUpdate = registerPlugin<{
  download(options: {
    version: string
    apkUrl: string
    checksumUrl: string
  }): Promise<{ version: string; size: number }>
  cancel(): Promise<void>
  install(options: { version: string }): Promise<{ status: InstallStatus }>
  addListener(
    eventName: 'downloadProgress',
    listener: (event: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'installStatus',
    listener: (event: InstallStatusEvent) => void,
  ): Promise<PluginListenerHandle>
}>('AppUpdate')

export type AppRuntime = {
  platform: string
  /** Android application id; absent on the web or if the plugin failed. */
  packageId?: string
  versionName: string
  versionCode?: string
  sha?: string
}

/**
 * The installed APK's own versionName/versionCode win; the build-time
 * `alma-build` value covers the web build and an unavailable App plugin.
 * Without a package id the updater stays hidden (see updateEligibility).
 */
export async function loadAppRuntime(): Promise<AppRuntime> {
  const platform = Capacitor.getPlatform()
  const build = parseBuildInfo(buildInfo)
  const fallback = {
    platform,
    versionName: build.version,
    ...(build.sha ? { sha: build.sha } : {}),
  }
  if (platform === 'web') return fallback
  try {
    const info = await App.getInfo()
    return {
      platform,
      packageId: info.id,
      versionName: info.version,
      versionCode: info.build,
      ...(build.sha ? { sha: build.sha } : {}),
    }
  } catch {
    return fallback
  }
}

export type InstallErrorKind = 'checksum' | 'cancelled' | 'download' | 'install'

export class UpdateInstallError extends Error {
  constructor(readonly kind: InstallErrorKind) {
    super(`Update install failed: ${kind}`)
    this.name = 'UpdateInstallError'
  }
}

const errorCode = (error: unknown) => (error as { code?: string } | null)?.code

/** Downloads and SHA-256-verifies the APK natively; progress is 0..1. */
export async function downloadNativeUpdate(
  version: string,
  apk: ReleaseApk,
  onProgress: (fraction: number) => void,
) {
  const handle = await AppUpdate.addListener(
    'downloadProgress',
    ({ received, total }) => {
      if (total > 0) onProgress(Math.min(received / total, 1))
    },
  )
  try {
    await AppUpdate.download({
      version,
      apkUrl: apk.url,
      checksumUrl: apk.checksumUrl,
    })
  } catch (error) {
    const code = errorCode(error)
    throw new UpdateInstallError(
      code === 'CHECKSUM_MISMATCH' || code === 'CHECKSUM_UNAVAILABLE'
        ? 'checksum'
        : code === 'CANCELLED'
          ? 'cancelled'
          : 'download',
    )
  } finally {
    void handle.remove()
  }
}

export const cancelNativeUpdate = () => AppUpdate.cancel()

export async function installNativeUpdate(version: string) {
  try {
    return (await AppUpdate.install({ version })).status
  } catch {
    throw new UpdateInstallError('install')
  }
}

/** Fires when the user returns from the "install unknown apps" screen. */
export async function subscribeNativeInstallStatus(
  listener: (event: InstallStatusEvent) => void,
) {
  const handle = await AppUpdate.addListener('installStatus', listener)
  return () => void handle.remove()
}
