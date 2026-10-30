import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { ActiveTransport, DesktopStatus } from './relay'
import { isAndroidNative } from './nativeRuntime'

export const BACKGROUND_CONNECTION_KEY = 'alma-mobile.background-connection.v1'

export interface BackgroundConnectionLabels {
  title: string
  channelName: string
  channelDescription: string
  stop: string
}

interface BackgroundConnectionPlugin {
  start(options: { status: string } & BackgroundConnectionLabels): Promise<void>
  stop(): Promise<void>
  update(options: { status: string }): Promise<void>
  getState(): Promise<{ running: boolean }>
  addListener(
    eventName: 'stopped',
    listener: () => void,
  ): Promise<PluginListenerHandle>
}

const BackgroundConnection = registerPlugin<BackgroundConnectionPlugin>(
  'BackgroundConnection',
)

export interface BackgroundDesktopState {
  name: string
  status: DesktopStatus
  transport: ActiveTransport
}

export interface BackgroundConnectionCopy {
  connected(name: string, transport: string): string
  reconnecting: string
  waiting: string
  relay: string
  lan: string
}

const defaultStorage = () => localStorage

export function loadBackgroundConnectionEnabled(
  storage: Pick<Storage, 'getItem'> = defaultStorage(),
) {
  try {
    return storage.getItem(BACKGROUND_CONNECTION_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveBackgroundConnectionEnabled(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = defaultStorage(),
) {
  storage.setItem(BACKGROUND_CONNECTION_KEY, enabled ? 'on' : 'off')
}

const preferenceEvent = 'alma-background-connection-change'

export function setBackgroundConnectionEnabled(enabled: boolean) {
  saveBackgroundConnectionEnabled(enabled)
  window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: enabled }))
}

export function subscribeBackgroundConnectionEnabled(
  listener: (enabled: boolean) => void,
) {
  const onChange = (event: Event) =>
    listener((event as CustomEvent<boolean>).detail)
  window.addEventListener(preferenceEvent, onChange)
  return () => window.removeEventListener(preferenceEvent, onChange)
}

export function backgroundConnectionStatus(
  desktops: BackgroundDesktopState[],
  activeName: string | undefined,
  copy: BackgroundConnectionCopy,
) {
  const active = desktops.find(({ name }) => name === activeName)
  const connected =
    active?.status === 'online'
      ? active
      : desktops.find(({ status }) => status === 'online')
  if (connected)
    return copy.connected(
      connected.name,
      connected.transport === 'direct' ? copy.lan : copy.relay,
    )
  if (desktops.length) return copy.reconnecting
  return copy.waiting
}

export async function setNativeBackgroundConnection(
  enabled: boolean,
  status: string,
  labels?: BackgroundConnectionLabels,
) {
  if (!isAndroidNative()) return
  if (enabled && labels) await BackgroundConnection.start({ status, ...labels })
  else if (!enabled) await BackgroundConnection.stop()
}

export async function updateNativeBackgroundConnectionStatus(status: string) {
  if (isAndroidNative()) await BackgroundConnection.update({ status })
}

export async function getNativeBackgroundConnectionRunning() {
  if (!isAndroidNative()) return undefined
  return (await BackgroundConnection.getState()).running
}

export async function subscribeNativeBackgroundConnectionStopped(
  listener: () => void,
) {
  if (!isAndroidNative()) return () => undefined
  const handle = await BackgroundConnection.addListener('stopped', listener)
  return () => void handle.remove()
}
