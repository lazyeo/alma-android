import { useCallback, useEffect, useState } from 'react'
import { useDesktops } from '../desktops/DesktopContext'
import { isUnsupportedEndpoint, type AlmaApi } from '../relay'
import {
  naturalTimeClueRange,
  timeClueRangeId,
  timeCluesHaveUnread,
} from './timeClues'

interface TimeCluesStatus {
  supported: boolean
  unread: boolean
}

interface StatusEntry {
  api: AlmaApi
  state: TimeCluesStatus
  listeners: Set<() => void>
  request?: Promise<void>
  loaded: boolean
}

const statusCache = new Map<string, StatusEntry>()

function entryFor(desktopId: string, api: AlmaApi) {
  const cached = statusCache.get(desktopId)
  if (cached?.api === api) return cached
  const entry: StatusEntry = {
    api,
    state: { supported: true, unread: false },
    listeners: new Set(),
    loaded: false,
  }
  statusCache.set(desktopId, entry)
  return entry
}

function update(entry: StatusEntry, state: TimeCluesStatus) {
  if (
    entry.state.supported === state.supported &&
    entry.state.unread === state.unread
  )
    return
  entry.state = state
  entry.listeners.forEach((listener) => listener())
}

function load(entry: StatusEntry) {
  if (entry.request) return entry.request
  const range = naturalTimeClueRange('today')
  entry.request = entry.api
    .getTimeClues(timeClueRangeId(range))
    .then((value) =>
      update(entry, {
        supported: true,
        unread: timeCluesHaveUnread(value, range.startDate),
      }),
    )
    .catch((cause) => {
      if (isUnsupportedEndpoint(cause))
        update(entry, { supported: false, unread: false })
    })
    .finally(() => {
      entry.loaded = true
      entry.request = undefined
    })
  return entry.request
}

/** Shared status for the active desktop's Time clues entry points. */
export function useTimeCluesStatus(desktopId: string) {
  const { desktops } = useDesktops()
  const api = desktops.find((desktop) => desktop.pairing.id === desktopId)
    ?.connection?.api
  const entry = api ? entryFor(desktopId, api) : undefined
  const [status, setStatus] = useState<TimeCluesStatus>(
    () => entry?.state ?? { supported: true, unread: false },
  )
  const refresh = useCallback(() => {
    if (entry) void load(entry)
  }, [entry])

  useEffect(() => {
    if (!entry) return
    const sync = () => setStatus(entry.state)
    entry.listeners.add(sync)
    sync()
    if (!entry.loaded) refresh()
    const refreshForDesktop = (event: Event) => {
      const detail = (event as CustomEvent<{ desktopId?: string }>).detail
      if (!detail?.desktopId || detail.desktopId === desktopId) refresh()
    }
    window.addEventListener('alma-time-clues-seen', refreshForDesktop)
    window.addEventListener('alma-time-clues-changed', refreshForDesktop)
    return () => {
      entry.listeners.delete(sync)
      window.removeEventListener('alma-time-clues-seen', refreshForDesktop)
      window.removeEventListener('alma-time-clues-changed', refreshForDesktop)
    }
  }, [desktopId, entry, refresh])

  return status
}
