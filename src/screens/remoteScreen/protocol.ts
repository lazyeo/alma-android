import type { ControlEvent } from './controls'

export type ScreenMode = 'jpeg' | 'video-jpeg' | 'video'

/** A display listed in `status.displays` (macOS and Linux desktops). */
export interface ScreenDisplay {
  id: number
  name: string
  width: number
  height: number
  scale: number
  primary: boolean
}

/** The window being streamed, from `status.window`. */
export interface ScreenWindowTarget {
  id: number
  app?: string
  title?: string
  bundleId?: string
}

/** One entry of the `windows` reply (macOS only). */
export interface ScreenWindow {
  id: number
  app?: string
  bundleId?: string
  title?: string
  width: number
  height: number
  displayId?: number
  focused?: boolean
  /** A `data:image/...` URL. */
  icon?: string
}

export type ScreenServerMessage =
  | {
      type: 'status'
      bound: boolean
      displayId: number
      width: number
      height: number
      scale: number
      mode: ScreenMode
      /** Set with `bound: false` when the desktop refuses to stream. */
      error?: string
      /** Every display, when the desktop can tell. */
      displays?: ScreenDisplay[]
      /** True when the desktop can stream a single window. */
      windows?: boolean
      /** Set while a single window is streamed. */
      window?: ScreenWindowTarget
      /** The streamed window closed; the desktop fell back to its display. */
      windowClosed?: boolean
      locked?: boolean
    }
  | { type: 'viewport'; width: number; height: number }
  | {
      type: 'frame'
      data: string
      width: number
      height: number
      seq: number
    }
  | { type: 'error'; message: string }
  | { type: 'rtc'; state: string }
  | { type: 'rtc_offer'; sdp: string; iceServers?: RTCIceServer[] }
  | { type: 'rtc_ice'; candidate: RTCIceCandidateInit }
  | ({ type: 'rtc_stats' } & Record<string, unknown>)
  | { type: 'clipboard'; text: string }
  | ({ type: 'preview_status' } & Record<string, unknown>)
  | { type: 'windows'; windows: ScreenWindow[]; error?: string }

export type ScreenFrame = Extract<ScreenServerMessage, { type: 'frame' }>
export type ScreenStatus = Extract<ScreenServerMessage, { type: 'status' }>

export type ScreenClientMessage =
  | ControlEvent
  | { type: 'text'; text: string }
  | { type: 'key'; key: string }
  /** Hides the Mac's own pointer while the phone draws a trackpad cursor. */
  | { type: 'mouse_mode'; on: boolean }
  /** Asks for the `windows` list. */
  | { type: 'windows' }
  | { type: 'clipboard'; text: string; paste?: boolean }
  | { type: 'rtc_start'; relayOnly?: boolean }
  | { type: 'rtc_answer'; sdp: string }
  | { type: 'rtc_ice'; candidate: RTCIceCandidateInit }
  | { type: 'rtc_stop' }

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined

const isId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

// Only inline images: a list from the desktop must never make the phone
// fetch a URL.
const imageData = (value: unknown) =>
  typeof value === 'string' && /^data:image\/[a-z+.-]+;base64,/i.test(value)
    ? value
    : undefined

function decodeDisplays(value: unknown): ScreenDisplay[] | undefined {
  if (!Array.isArray(value)) return undefined
  const displays = value
    .filter((item) => item && typeof item === 'object' && isId(item.id))
    .map((item) => ({
      id: item.id as number,
      name: text(item.name) ?? '',
      width: finite(item.width) ? item.width : 0,
      height: finite(item.height) ? item.height : 0,
      scale: finite(item.scale) ? item.scale : 1,
      primary: item.primary === true,
    }))
  return displays.length ? displays : undefined
}

function decodeWindowTarget(value: any): ScreenWindowTarget | undefined {
  if (!value || typeof value !== 'object' || !isId(value.id) || !value.id)
    return undefined
  return {
    id: value.id,
    app: text(value.app),
    title: text(value.title),
    bundleId: text(value.bundleId),
  }
}

export function decodeWindows(value: unknown): ScreenWindow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item) =>
        item && typeof item === 'object' && isId(item.id) && item.id > 0,
    )
    .map((item) => ({
      id: item.id as number,
      app: text(item.app),
      bundleId: text(item.bundleId),
      title: text(item.title),
      width: finite(item.width) ? item.width : 0,
      height: finite(item.height) ? item.height : 0,
      displayId: isId(item.displayId) ? item.displayId : undefined,
      focused: item.focused === true,
      icon: imageData(item.icon),
    }))
}

const statusExtras = (value: any) => ({
  displays: decodeDisplays(value.displays),
  windows: value.windows === true,
  window: decodeWindowTarget(value.window),
  windowClosed: value.windowClosed === true,
  locked: value.locked === true,
})

export function decodeScreenMessage(
  raw: string,
): ScreenServerMessage | undefined {
  let value: any
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined
  switch (value.type) {
    case 'status':
      // A refusal is meaningful even if the desktop omits the display fields.
      if (value.bound === false && typeof value.error === 'string')
        return {
          type: 'status',
          bound: false,
          displayId: finite(value.displayId) ? value.displayId : 0,
          width: finite(value.width) ? value.width : 0,
          height: finite(value.height) ? value.height : 0,
          scale: finite(value.scale) ? value.scale : 1,
          mode: ['jpeg', 'video-jpeg', 'video'].includes(value.mode)
            ? value.mode
            : 'jpeg',
          error: value.error,
          ...statusExtras(value),
        }
      if (
        typeof value.bound === 'boolean' &&
        finite(value.displayId) &&
        finite(value.width) &&
        finite(value.height) &&
        finite(value.scale) &&
        ['jpeg', 'video-jpeg', 'video'].includes(value.mode)
      )
        return {
          type: 'status',
          bound: value.bound,
          displayId: value.displayId,
          width: value.width,
          height: value.height,
          scale: value.scale,
          mode: value.mode,
          ...(typeof value.error === 'string' ? { error: value.error } : {}),
          ...statusExtras(value),
        }
      return undefined
    case 'viewport':
      return finite(value.width) && finite(value.height) ? value : undefined
    case 'frame':
      return typeof value.data === 'string' &&
        finite(value.width) &&
        finite(value.height) &&
        finite(value.seq)
        ? value
        : undefined
    case 'error':
      return typeof value.message === 'string' ? value : undefined
    case 'rtc':
      return typeof value.state === 'string' ? value : undefined
    case 'rtc_offer':
      return typeof value.sdp === 'string' ? value : undefined
    case 'rtc_ice':
      return value.candidate && typeof value.candidate === 'object'
        ? value
        : undefined
    case 'rtc_stats':
    case 'preview_status':
      return value
    case 'clipboard':
      return typeof value.text === 'string' ? value : undefined
    case 'windows':
      return {
        type: 'windows',
        windows: decodeWindows(value.windows),
        ...(typeof value.error === 'string' ? { error: value.error } : {}),
      }
    default:
      return undefined
  }
}

export const latestFrame = (
  current: ScreenFrame | undefined,
  incoming: ScreenFrame,
) => (!current || incoming.seq > current.seq ? incoming : current)
