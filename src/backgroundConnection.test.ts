import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopStatus } from './relay'

const { android, start, stop, update, getState, addListener } = vi.hoisted(
  () => ({
    android: { value: true },
    start: vi.fn(),
    stop: vi.fn(),
    update: vi.fn(),
    getState: vi.fn(),
    addListener: vi.fn(),
  }),
)

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ start, stop, update, getState, addListener }),
}))
vi.mock('./nativeRuntime', () => ({
  isAndroidNative: () => android.value,
}))

import {
  BACKGROUND_CONNECTION_KEY,
  backgroundConnectionStatus,
  loadBackgroundConnectionEnabled,
  saveBackgroundConnectionEnabled,
  getNativeBackgroundConnectionRunning,
  setNativeBackgroundConnection,
  updateNativeBackgroundConnectionStatus,
} from './backgroundConnection'

const desktop = (name: string, status: DesktopStatus, relayUrl: string) => ({
  name,
  status,
  relayUrl,
})

describe('background connection setting', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }

  beforeEach(() => {
    values.clear()
    vi.clearAllMocks()
    android.value = true
  })

  it('defaults off and persists explicit changes', () => {
    expect(loadBackgroundConnectionEnabled(storage)).toBe(false)
    saveBackgroundConnectionEnabled(true, storage)
    expect(storage.getItem(BACKGROUND_CONNECTION_KEY)).toBe('on')
    expect(loadBackgroundConnectionEnabled(storage)).toBe(true)
    saveBackgroundConnectionEnabled(false, storage)
    expect(storage.getItem(BACKGROUND_CONNECTION_KEY)).toBe('off')
    expect(loadBackgroundConnectionEnabled(storage)).toBe(false)
  })

  it('maps connection state to concise foreground-service text', () => {
    const copy = {
      connected: (name: string, transport: string) =>
        `Connected to ${name} · ${transport}`,
      reconnecting: 'Reconnecting…',
      waiting: 'Waiting for a desktop…',
      relay: 'relay',
      lan: 'LAN',
    }
    expect(
      backgroundConnectionStatus(
        [desktop('Mini', 'online', 'https://relay.example')],
        'Mini',
        copy,
      ),
    ).toBe('Connected to Mini · relay')
    expect(
      backgroundConnectionStatus(
        [desktop('Home', 'online', 'http://192.168.1.8:23001')],
        'Home',
        copy,
      ),
    ).toBe('Connected to Home · LAN')
    expect(
      backgroundConnectionStatus(
        [desktop('Mini', 'connecting', 'https://relay.example')],
        'Mini',
        copy,
      ),
    ).toBe('Reconnecting…')
    expect(backgroundConnectionStatus([], undefined, copy)).toBe(
      'Waiting for a desktop…',
    )
  })

  it('starts, stops, and updates the native service on Android', async () => {
    const labels = {
      title: 'Alma Mobile',
      channelName: 'Background connection',
      channelDescription: 'Keeps the desktop connection active',
      stop: 'Stop',
    }
    await setNativeBackgroundConnection(true, 'Reconnecting…', labels)
    expect(start).toHaveBeenCalledWith({ status: 'Reconnecting…', ...labels })
    getState.mockResolvedValue({ running: true })
    await expect(getNativeBackgroundConnectionRunning()).resolves.toBe(true)
    await updateNativeBackgroundConnectionStatus('Connected')
    expect(update).toHaveBeenCalledWith({ status: 'Connected' })
    await setNativeBackgroundConnection(false, 'ignored')
    expect(stop).toHaveBeenCalledOnce()
  })

  it('is a no-op on web', async () => {
    android.value = false
    await setNativeBackgroundConnection(true, 'Reconnecting…')
    await expect(
      getNativeBackgroundConnectionRunning(),
    ).resolves.toBeUndefined()
    await updateNativeBackgroundConnectionStatus('Connected')
    expect(start).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
