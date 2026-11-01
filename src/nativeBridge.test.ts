import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capabilities, configure, preview, android } = vi.hoisted(() => ({
  capabilities: vi.fn(),
  configure: vi.fn(),
  preview: vi.fn(),
  android: { value: true },
}))
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    apply: vi.fn(),
    haptic: vi.fn(),
    setFullscreen: vi.fn(),
    capabilities,
    configure,
    preview,
  }),
}))
vi.mock('@capacitor/app', () => ({ App: {} }))
vi.mock('@capacitor/keyboard', () => ({ Keyboard: {}, KeyboardResize: {} }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: {} }))
vi.mock('./nativeRuntime', () => ({
  isNativePlatform: () => true,
  isAndroidNative: () => android.value,
}))

import {
  configureNativeFoldTransition,
  getNativeFoldCapabilities,
  previewNativeFoldTransition,
} from './nativeBridge'
import {
  defaultFoldTransitionSettings,
  foldTransitionNativeConfig,
} from './foldTransition'

describe('native fold transition bridge', () => {
  const config = foldTransitionNativeConfig(defaultFoldTransitionSettings)
  beforeEach(() => {
    vi.clearAllMocks()
    android.value = true
  })

  it('sends the full config and starts a preview on Android', async () => {
    await expect(configureNativeFoldTransition(config)).resolves.toBe(true)
    expect(configure).toHaveBeenCalledWith(config)
    await expect(previewNativeFoldTransition('open')).resolves.toBe(true)
    expect(preview).toHaveBeenCalledWith({ direction: 'open' })
    await expect(previewNativeFoldTransition('close')).resolves.toBe(true)
    expect(preview).toHaveBeenCalledWith({ direction: 'close' })
  })

  it('caches native fold capabilities for the session', async () => {
    capabilities.mockResolvedValue({ foldable: true, reason: 'hinge_sensor' })
    await expect(getNativeFoldCapabilities()).resolves.toEqual({
      foldable: true,
      reason: 'hinge_sensor',
    })
    await expect(getNativeFoldCapabilities()).resolves.toEqual({
      foldable: true,
      reason: 'hinge_sensor',
    })
    expect(capabilities).toHaveBeenCalledTimes(1)
  })

  it('returns the web fallback off Android', async () => {
    android.value = false
    await expect(getNativeFoldCapabilities()).resolves.toEqual({
      foldable: false,
      reason: 'web',
    })
    await expect(configureNativeFoldTransition(config)).resolves.toBe(false)
    await expect(previewNativeFoldTransition('open')).resolves.toBe(false)
    expect(capabilities).not.toHaveBeenCalled()
    expect(configure).not.toHaveBeenCalled()
    expect(preview).not.toHaveBeenCalled()
  })

  it('is a no-op when an older APK lacks the plugin', async () => {
    configure.mockRejectedValueOnce(
      Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' }),
    )
    await expect(configureNativeFoldTransition(config)).resolves.toBe(false)
  })

  it('is a no-op when the device cannot render the preview', async () => {
    preview.mockRejectedValueOnce(
      Object.assign(new Error('needs Android 13'), { code: 'UNAVAILABLE' }),
    )
    await expect(previewNativeFoldTransition('open')).resolves.toBe(false)
  })

  it('surfaces other native failures', async () => {
    preview.mockRejectedValueOnce(new Error('boom'))
    await expect(previewNativeFoldTransition('close')).rejects.toThrow('boom')
  })
})
