/**
 * A voice message as the desktop stores it on the row: `metadata.voice`
 * (Desktop 0.4.528+). The text parts of the same row carry the caption or
 * the spoken text, so there is no separate transcript here.
 */
export interface VoiceNote {
  /** Tunnel path under `/api/gallery/cache/`, never a desktop-local URL. */
  path: string
  /** Declared `audio/*` type, when the desktop gave a usable one. */
  mediaType?: string
  /** 0 when the desktop could not decode the audio; the player fills it in. */
  durationMs: number
  /** 0..1 levels; empty when the desktop sent none. */
  waveform: number[]
}

export type VoiceNoteState =
  | { kind: 'none' }
  | { kind: 'playable'; voice: VoiceNote }
  /** The row says it is a voice message but we cannot safely play it. */
  | { kind: 'unsupported' }

const GALLERY_CACHE = '/api/gallery/cache/'
// Mirrors the desktop's own sanitizer so we never ask the tunnel for a path
// the desktop would not have written.
const CACHE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const DESKTOP_LOCAL = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/i
const MAX_DURATION_MS = 30 * 60 * 1000
const MAX_BARS = 64

/** `/api/gallery/cache/<name>` for a relative or desktop-local URL, else undefined. */
export function voiceNotePath(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.length > 512) return undefined
  const local = DESKTOP_LOCAL.exec(url)
  const path = (local ? local[1] : url).split(/[?#]/)[0]
  if (!path.startsWith(GALLERY_CACHE)) return undefined
  const name = path.slice(GALLERY_CACHE.length)
  return CACHE_NAME.test(name) && !name.includes('..') ? path : undefined
}

export function parseVoiceNote(metadata: unknown): VoiceNoteState {
  if (!metadata || typeof metadata !== 'object' || !('voice' in metadata))
    return { kind: 'none' }
  const voice = (metadata as { voice: unknown }).voice
  if (voice === undefined || voice === null) return { kind: 'none' }
  if (typeof voice !== 'object') return { kind: 'unsupported' }
  const raw = voice as Record<string, unknown>
  const path = voiceNotePath(raw.url)
  if (!path) return { kind: 'unsupported' }
  const mediaType =
    typeof raw.mediaType === 'string'
      ? raw.mediaType.toLowerCase().split(';')[0].trim()
      : ''
  return {
    kind: 'playable',
    voice: {
      path,
      mediaType: mediaType.startsWith('audio/') ? mediaType : undefined,
      durationMs: clampDuration(raw.durationMs),
      waveform: parseWaveform(raw.waveform),
    },
  }
}

function clampDuration(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(value)))
}

function parseWaveform(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const levels = value
    .slice(0, 4096)
    .map((level) =>
      typeof level === 'number' && Number.isFinite(level)
        ? Math.min(1, Math.max(0, level))
        : 0,
    )
  return levels.length > MAX_BARS ? downsample(levels, MAX_BARS) : levels
}

/** Peak per bucket, so a long older-format waveform still fits the capsule. */
function downsample(levels: number[], bars: number) {
  return Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * levels.length) / bars)
    const end = Math.max(
      start + 1,
      Math.floor(((bar + 1) * levels.length) / bars),
    )
    return Math.max(...levels.slice(start, end))
  })
}

/** `m:ss` clock for the capsule; hours roll into minutes (max is 30:00). */
export function formatVoiceClock(ms: number) {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Unknown part types that look like audio get the voice placeholder. */
export function isVoiceLikePart(part: { type: string; mediaType?: unknown }) {
  return (
    /voice|audio/i.test(part.type) ||
    (typeof part.mediaType === 'string' && part.mediaType.startsWith('audio/'))
  )
}
