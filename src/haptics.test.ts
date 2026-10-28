import { afterEach, expect, it, vi } from 'vitest'
const { impact, nativeHaptic } = vi.hoisted(() => ({
  impact: vi.fn(),
  nativeHaptic: vi.fn(),
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}))
vi.mock('./nativeBridge', () => ({ performNativeHaptic: nativeHaptic }))
vi.mock('./nativeRuntime', () => ({ isNativePlatform: vi.fn(() => false) }))
import { isNativePlatform } from './nativeRuntime'
import { haptic } from './haptics'
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
it('does nothing on web', async () => {
  await haptic()
  await haptic('selection')
  await haptic('medium')
  expect(nativeHaptic).not.toHaveBeenCalled()
  expect(impact).not.toHaveBeenCalled()
})
it('honors local opt-out and falls back when the native bridge is missing', async () => {
  vi.mocked(isNativePlatform).mockReturnValue(true)
  vi.stubGlobal('localStorage', { getItem: () => 'off' })
  await haptic()
  expect(nativeHaptic).not.toHaveBeenCalled()
  expect(impact).not.toHaveBeenCalled()
  vi.stubGlobal('localStorage', { getItem: () => 'on' })
  nativeHaptic.mockRejectedValueOnce(new Error('unavailable'))
  await expect(haptic()).resolves.toBeUndefined()
  expect(impact).toHaveBeenCalledWith({ style: 'MEDIUM' })
})

it('uses native Android tick, click and long-press feedback', async () => {
  vi.mocked(isNativePlatform).mockReturnValue(true)
  vi.stubGlobal('localStorage', { getItem: () => 'on' })
  await haptic('selection')
  await haptic('light')
  await haptic('medium')
  expect(nativeHaptic.mock.calls).toEqual([
    ['selection'],
    ['light'],
    ['medium'],
  ])
  expect(impact).not.toHaveBeenCalled()
})
