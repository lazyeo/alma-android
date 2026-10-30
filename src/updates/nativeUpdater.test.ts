import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'android',
  getInfo: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  cancel: vi.fn(),
  addListener: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform },
  registerPlugin: () => ({
    download: native.download,
    install: native.install,
    cancel: native.cancel,
    addListener: native.addListener,
  }),
}))
vi.mock('@capacitor/app', () => ({ App: { getInfo: native.getInfo } }))
vi.mock('../buildInfo', () => ({ buildInfo: '0.1.2 abc1234' }))

import {
  downloadNativeUpdate,
  installNativeUpdate,
  loadAppRuntime,
} from './nativeUpdater'

const apk = {
  name: 'alma-android-v0.1.3.apk',
  url: 'https://github.com/lazyeo/alma-android/releases/download/v0.1.3/alma-android-v0.1.3.apk',
  size: 10,
  checksumUrl:
    'https://github.com/lazyeo/alma-android/releases/download/v0.1.3/alma-android-v0.1.3.apk.sha256',
}

describe('app runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    native.platform = 'android'
  })

  it('prefers the native versionName and versionCode', async () => {
    native.getInfo.mockResolvedValue({
      id: 'club.a_dobe.alma',
      name: 'Alma',
      version: '0.1.2',
      build: '102',
    })
    await expect(loadAppRuntime()).resolves.toEqual({
      platform: 'android',
      packageId: 'club.a_dobe.alma',
      versionName: '0.1.2',
      versionCode: '102',
      sha: 'abc1234',
    })
  })

  it('falls back to the build-time version without a package id', async () => {
    native.getInfo.mockRejectedValue(new Error('not implemented'))
    await expect(loadAppRuntime()).resolves.toEqual({
      platform: 'android',
      versionName: '0.1.2',
      sha: 'abc1234',
    })
  })

  it('uses build info on the web without calling the native plugin', async () => {
    native.platform = 'web'
    await expect(loadAppRuntime()).resolves.toEqual({
      platform: 'web',
      versionName: '0.1.2',
      sha: 'abc1234',
    })
    expect(native.getInfo).not.toHaveBeenCalled()
  })
})

describe('native update install', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    native.addListener.mockResolvedValue({ remove: native.remove })
  })

  it('downloads the verified APK, reports progress and stops listening', async () => {
    native.download.mockImplementation(async () => {
      const listener = native.addListener.mock.calls[0][1]
      listener({ received: 5, total: 10 })
      return { version: '0.1.3', size: 10 }
    })
    const progress = vi.fn()
    await downloadNativeUpdate('0.1.3', apk, progress)
    expect(native.addListener).toHaveBeenCalledWith(
      'downloadProgress',
      expect.any(Function),
    )
    expect(native.download).toHaveBeenCalledWith({
      version: '0.1.3',
      apkUrl: apk.url,
      checksumUrl: apk.checksumUrl,
    })
    expect(progress).toHaveBeenCalledWith(0.5)
    expect(native.remove).toHaveBeenCalled()
  })

  it('maps native failures to install error kinds', async () => {
    for (const [code, kind] of [
      ['CHECKSUM_MISMATCH', 'checksum'],
      ['CHECKSUM_UNAVAILABLE', 'checksum'],
      ['CANCELLED', 'cancelled'],
      ['DOWNLOAD_FAILED', 'download'],
      [undefined, 'download'],
    ] as const) {
      native.download.mockRejectedValueOnce(
        Object.assign(new Error('failed'), { code }),
      )
      await expect(
        downloadNativeUpdate('0.1.3', apk, () => undefined),
      ).rejects.toMatchObject({ kind })
    }
    expect(native.remove).toHaveBeenCalledTimes(5)
  })

  it('returns whether the installer opened or needs permission first', async () => {
    native.install.mockResolvedValueOnce({ status: 'permissionRequired' })
    await expect(installNativeUpdate('0.1.3')).resolves.toBe(
      'permissionRequired',
    )
    native.install.mockRejectedValueOnce(
      Object.assign(new Error('no installer'), { code: 'INSTALL_FAILED' }),
    )
    await expect(installNativeUpdate('0.1.3')).rejects.toMatchObject({
      kind: 'install',
    })
  })
})
