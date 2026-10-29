import type { ControlEvent } from './controls'

export type ScreenMode = 'jpeg' | 'video-jpeg' | 'video'

export type ScreenServerMessage =
  | {
      type: 'status'
      bound: boolean
      displayId: number
      width: number
      height: number
      scale: number
      mode: ScreenMode
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

export type ScreenFrame = Extract<ScreenServerMessage, { type: 'frame' }>

export type ScreenClientMessage =
  | ControlEvent
  | { type: 'text'; text: string }
  | { type: 'key'; key: string }
  | { type: 'clipboard'; text: string; paste?: boolean }
  | { type: 'rtc_start'; relayOnly?: boolean }
  | { type: 'rtc_answer'; sdp: string }
  | { type: 'rtc_ice'; candidate: RTCIceCandidateInit }
  | { type: 'rtc_stop' }

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

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
      if (
        typeof value.bound === 'boolean' &&
        finite(value.displayId) &&
        finite(value.width) &&
        finite(value.height) &&
        finite(value.scale) &&
        ['jpeg', 'video-jpeg', 'video'].includes(value.mode)
      )
        return value
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
    default:
      return undefined
  }
}

export const latestFrame = (
  current: ScreenFrame | undefined,
  incoming: ScreenFrame,
) => (!current || incoming.seq > current.seq ? incoming : current)
