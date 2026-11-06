// The desktop's in-app browser (IAB) as a live picture, over
// `WS /ws/iab/<threadId>` (Alma Desktop 0.4.467, verified in its main
// bundle). The desktop screencasts the browser that belongs to the thread's
// workspace as JPEG frames, optionally upgraded to WebRTC video, and runs the
// phone's taps, scrolls, typing and navigation on that page. The page runs on
// the Mac, so addresses only the Mac can reach (localhost) work too.
//
// Frame and viewport sizes are the page's CSS pixels, and taps and scrolls
// are sent in the same CSS pixels (the desktop hands them to CDP
// `Input.dispatchMouseEvent`).

import type { RtcSignal } from '../liveStream/rtcViewer'

export interface IabTab {
  id: string
  url: string
  title: string
  loading: boolean
  pinned: boolean
  /** The agent opened this tab. */
  agent: boolean
}

export interface IabPage {
  url: string
  title: string
  loading: boolean
}

export type IabServerMessage =
  /** `bound: false` means the thread has no browser open on the Mac. */
  | ({ type: 'status'; bound: boolean; error?: string } & IabPage)
  | ({ type: 'page' } & IabPage)
  | { type: 'tabs'; tabs: IabTab[]; activeId: string }
  | { type: 'viewport'; width: number; height: number }
  | { type: 'frame'; data: string; width: number; height: number; seq: number }
  | { type: 'error'; message: string }
  | { type: 'rtc'; state: string }
  | { type: 'rtc_offer'; sdp: string; iceServers?: RTCIceServer[] }
  | { type: 'rtc_ice'; candidate: RTCIceCandidateInit }

export type IabFrame = Extract<IabServerMessage, { type: 'frame' }>
export type IabStatus = Extract<IabServerMessage, { type: 'status' }>

/** Key names the desktop maps to key events (its `cuaKeypress`). */
export const IAB_KEYS = [
  'Escape',
  'Tab',
  'Enter',
  'Backspace',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'ArrowRight',
] as const
export type IabKey = (typeof IAB_KEYS)[number]

/** Page input: goes over the WebRTC data channel when open, else the socket. */
export type IabInput =
  | { type: 'tap' | 'double_tap'; x: number; y: number }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: IabKey }
  /** The desktop turns words into a search and bare hosts into https. */
  | { type: 'navigate'; url: string }
  | { type: 'tab'; action: 'view' | 'close'; id: string }
  | { type: 'tab'; action: 'new'; url?: string }
  | { type: 'back' | 'forward' | 'reload' }

export type IabClientMessage =
  IabInput | { type: 'rtc_start'; relayOnly: boolean } | RtcSignal

export const iabSocketPath = (threadId: string) =>
  `/ws/iab/${encodeURIComponent(threadId)}`

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const string = (value: unknown) => (typeof value === 'string' ? value : '')

const page = (value: any): IabPage => ({
  url: string(value.url),
  title: string(value.title),
  loading: value.loading === true,
})

function decodeTabs(value: unknown): IabTab[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        item.id,
    )
    .map((item) => ({
      id: item.id as string,
      ...page(item),
      pinned: item.pinned === true,
      agent: item.agent === true,
    }))
}

export function decodeIabMessage(raw: string): IabServerMessage | undefined {
  let value: any
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined
  switch (value.type) {
    case 'status':
      if (typeof value.bound !== 'boolean') return undefined
      return {
        type: 'status',
        bound: value.bound,
        ...page(value),
        ...(typeof value.error === 'string' ? { error: value.error } : {}),
      }
    case 'page':
      return { type: 'page', ...page(value) }
    case 'tabs':
      return {
        type: 'tabs',
        tabs: decodeTabs(value.tabs),
        activeId: string(value.activeId),
      }
    case 'viewport':
      return finite(value.width) && finite(value.height)
        ? { type: 'viewport', width: value.width, height: value.height }
        : undefined
    case 'frame':
      return typeof value.data === 'string' &&
        finite(value.width) &&
        finite(value.height) &&
        finite(value.seq)
        ? {
            type: 'frame',
            data: value.data,
            width: value.width,
            height: value.height,
            seq: value.seq,
          }
        : undefined
    case 'error':
      return typeof value.message === 'string'
        ? { type: 'error', message: value.message }
        : undefined
    case 'rtc':
      return typeof value.state === 'string'
        ? { type: 'rtc', state: value.state }
        : undefined
    case 'rtc_offer':
      return typeof value.sdp === 'string'
        ? {
            type: 'rtc_offer',
            sdp: value.sdp,
            ...(Array.isArray(value.iceServers)
              ? { iceServers: value.iceServers }
              : {}),
          }
        : undefined
    case 'rtc_ice':
      return value.candidate && typeof value.candidate === 'object'
        ? { type: 'rtc_ice', candidate: value.candidate }
        : undefined
    default:
      return undefined
  }
}

/**
 * The desktop keys a thread's browser by workspace: the artifact workspace
 * when the thread keeps artifacts, else its own workspace.
 */
export function iabWorkspaceKey(thread: {
  workspaceId?: unknown
  enableArtifacts?: unknown
  artifactWorkspaceId?: unknown
}): string | undefined {
  if (
    thread.enableArtifacts === true &&
    typeof thread.artifactWorkspaceId === 'string' &&
    thread.artifactWorkspaceId
  )
    return thread.artifactWorkspaceId
  return typeof thread.workspaceId === 'string' && thread.workspaceId
    ? thread.workspaceId
    : undefined
}

/** Reads `GET /api/iab/status`: is a browser open for this workspace? */
export function threadBrowserOpen(
  status: unknown,
  workspaceKey: string | undefined,
) {
  if (!workspaceKey || !status || typeof status !== 'object') return false
  const targets = (status as { targets?: unknown }).targets
  return (
    Array.isArray(targets) &&
    targets.some(
      (target) =>
        target &&
        typeof target === 'object' &&
        (target as { workspaceId?: unknown }).workspaceId === workspaceKey,
    )
  )
}

export interface PageSize {
  width: number
  height: number
}

/** A 0..1 point on the picture → the page's CSS pixel under it. */
export function pagePoint(point: { x: number; y: number }, viewport: PageSize) {
  const axis = (value: number, length: number) =>
    Math.min(Math.max(0, length - 1), Math.max(0, Math.round(value * length)))
  return { x: axis(point.x, viewport.width), y: axis(point.y, viewport.height) }
}

/**
 * A finger movement (0..1 of the picture) → the wheel delta in page pixels.
 * Content follows the finger, so the wheel goes the other way.
 */
export function pageScroll(
  delta: { x: number; y: number },
  viewport: PageSize,
) {
  return {
    dx: -delta.x * viewport.width || 0,
    dy: -delta.y * viewport.height || 0,
  }
}

/** The address bar shows nothing for a blank page. */
export const addressText = (url: string) => (url === 'about:blank' ? '' : url)
