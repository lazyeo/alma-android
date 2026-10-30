import { useEffect, useState } from 'react'
import type { AlmaApi } from '../relay/almaApi'

export type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'other'

/** Product names; not translated. */
export const PLATFORM_LABELS = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
} as const

export function toDesktopPlatform(value: unknown): DesktopPlatform | undefined {
  if (typeof value !== 'string' || !value) return undefined
  return value === 'darwin' || value === 'win32' || value === 'linux'
    ? value
    : 'other'
}

// Remembered per desktop so offline desktops keep their icon.
const storageKey = (desktopId: string) => `alma.desktop.platform.${desktopId}`

export function recallDesktopPlatform(desktopId: string) {
  try {
    return toDesktopPlatform(localStorage.getItem(storageKey(desktopId)))
  } catch {
    return undefined
  }
}

export function rememberDesktopPlatform(
  desktopId: string,
  platform: DesktopPlatform,
) {
  try {
    localStorage.setItem(storageKey(desktopId), platform)
  } catch {
    // Storage is best effort.
  }
}

// One request per connection, shared by every icon that shows the desktop.
const pending = new WeakMap<AlmaApi, Promise<DesktopPlatform | undefined>>()

function fetchPlatform(api: AlmaApi) {
  let request = pending.get(api)
  if (!request) {
    request = api
      .getComputerUseStatus()
      .then((status) => toDesktopPlatform(status?.platform))
      .catch(() => {
        // Older desktops or a dropped connection: allow a later retry.
        pending.delete(api)
        return undefined
      })
    pending.set(api, request)
  }
  return request
}

/** The desktop's OS: remembered value first, refreshed while online. */
export function useDesktopPlatform(desktopId: string, api?: AlmaApi) {
  const [platform, setPlatform] = useState(() =>
    recallDesktopPlatform(desktopId),
  )
  useEffect(() => {
    setPlatform(recallDesktopPlatform(desktopId))
    if (!api) return
    let current = true
    void fetchPlatform(api).then((next) => {
      if (!current || !next) return
      rememberDesktopPlatform(desktopId, next)
      setPlatform(next)
    })
    return () => {
      current = false
    }
  }, [api, desktopId])
  return platform
}
