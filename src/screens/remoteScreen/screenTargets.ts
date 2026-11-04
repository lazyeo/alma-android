// What the remote screen streams: a display, or a single app window.
//
// The desktop picks the target when the socket opens
// (`/ws/screen?display=<id>&window=<id>`); there is no message to retarget a
// live stream, so choosing another target reconnects. It lists windows on
// request (`{type:"windows"}`, macOS only) and reports displays and window
// support in `status`.

import type { ScreenDisplay, ScreenStatus, ScreenWindow } from './protocol'

export interface ScreenTarget {
  displayId?: number
  windowId?: number
}

const isId = (value: number | undefined): value is number =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0

export function screenPath(target: ScreenTarget) {
  const query = new URLSearchParams()
  if (isId(target.displayId)) query.set('display', String(target.displayId))
  if (isId(target.windowId) && target.windowId > 0)
    query.set('window', String(target.windowId))
  const search = query.toString()
  return search ? `/ws/screen?${search}` : '/ws/screen'
}

/** Whether there is anything to choose between on this desktop. */
export function canPickTarget(status?: ScreenStatus) {
  if (!status || !status.bound) return false
  return status.windows === true || (status.displays?.length ?? 0) > 1
}

export type PickerSelection =
  { kind: 'display'; id: number } | { kind: 'window'; id: number }

/** What the desktop says it is streaming now. */
export function currentSelection(status?: ScreenStatus): PickerSelection {
  if (status?.window) return { kind: 'window', id: status.window.id }
  return { kind: 'display', id: status?.displayId ?? 0 }
}

/** Display rows: only worth listing when there is more than one. */
export function pickerDisplays(status?: ScreenStatus): ScreenDisplay[] {
  const displays = status?.displays ?? []
  if (displays.length < 2) return []
  // Primary first, then the desktop's order.
  return [...displays].sort((a, b) => Number(b.primary) - Number(a.primary))
}

/** Windows worth offering: titled or named, with a real size. */
export function pickerWindows(windows: ScreenWindow[]): ScreenWindow[] {
  return windows.filter(
    (window) =>
      window.width > 1 && window.height > 1 && (window.app || window.title),
  )
}

/** The app name, falling back to the last part of the bundle id. */
export function windowAppName(window: { app?: string; bundleId?: string }) {
  if (window.app) return window.app
  const tail = window.bundleId?.split('.').filter(Boolean).at(-1)
  return tail ?? ''
}

export function targetForSelection(
  selection: PickerSelection,
  status?: ScreenStatus,
): ScreenTarget {
  if (selection.kind === 'window') return { windowId: selection.id }
  // The only display is the default; keep the URL plain then.
  if ((status?.displays?.length ?? 0) < 2) return {}
  return { displayId: selection.id }
}

export const sameSelection = (a: PickerSelection, b: PickerSelection) =>
  a.kind === b.kind && a.id === b.id
