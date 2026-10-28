/**
 * Desktop thread loop (GET/PUT/DELETE /api/threads/:id/loop): a prompt the
 * desktop re-sends every `intervalMs`. Stopping keeps the record and stamps
 * `stoppedAt`; the desktop also stops loops after 7 days or 200 iterations.
 */
export interface ThreadLoop {
  prompt: string
  intervalMs: number
  startedAt: number
  iterations: number
  lastFiredAt?: number
  stoppedAt?: number
  stoppedReason?: string
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export function parseLoop(value: unknown): ThreadLoop | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (
    typeof v.prompt !== 'string' ||
    !v.prompt.trim() ||
    !finite(v.intervalMs) ||
    !finite(v.startedAt) ||
    !finite(v.iterations)
  )
    return null
  return {
    prompt: v.prompt,
    intervalMs: v.intervalMs,
    startedAt: v.startedAt,
    iterations: v.iterations,
    ...(finite(v.lastFiredAt) ? { lastFiredAt: v.lastFiredAt } : {}),
    ...(finite(v.stoppedAt) ? { stoppedAt: v.stoppedAt } : {}),
    ...(typeof v.stoppedReason === 'string'
      ? { stoppedReason: v.stoppedReason }
      : {}),
  }
}

export type LoopStatus = 'none' | 'running' | 'stopped'

export function loopStatus(loop: ThreadLoop | null): LoopStatus {
  return !loop ? 'none' : loop.stoppedAt != null ? 'stopped' : 'running'
}

export const isLoopRunning = (loop: ThreadLoop | null) =>
  loopStatus(loop) === 'running'

const LEADING_UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 } as const
const TRAILING_UNITS = {
  second: 1e3,
  minute: 6e4,
  hour: 36e5,
  day: 864e5,
} as const

/**
 * Mirrors the desktop's prompt syntax: `5m check CI` or
 * `check CI every 5 minutes`. Used only to preview the interval; the raw
 * prompt is sent unchanged and the desktop does the authoritative parse
 * (and clamps to 1 minute – 1 day).
 */
export function parseLoopPrompt(input: string): {
  intervalMs: number | null
  prompt: string
} {
  const text = input.trim()
  const leading = text.match(/^(\d+)\s*([smhd])\b\s*/i)
  if (leading)
    return {
      intervalMs:
        Number(leading[1]) *
        LEADING_UNITS[leading[2].toLowerCase() as keyof typeof LEADING_UNITS],
      prompt: text.slice(leading[0].length).trim(),
    }
  const trailing = text.match(
    /\s+every\s+(\d+)?\s*(second|minute|hour|day)s?\s*$/i,
  )
  if (trailing)
    return {
      intervalMs:
        (trailing[1] ? Number(trailing[1]) : 1) *
        TRAILING_UNITS[
          trailing[2].toLowerCase() as keyof typeof TRAILING_UNITS
        ],
      prompt: text.slice(0, text.length - trailing[0].length).trim(),
    }
  return { intervalMs: null, prompt: text }
}

export function formatLoopInterval(ms: number) {
  if (ms % 864e5 === 0) return `${ms / 864e5}d`
  if (ms % 36e5 === 0) return `${ms / 36e5}h`
  return `${Math.round(ms / 6e4)}m`
}
