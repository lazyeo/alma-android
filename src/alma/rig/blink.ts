export interface BlinkOptions {
  random?: () => number
  /** Shortest and longest gap between blinks. */
  minMs?: number
  maxMs?: number
  /** Chance that a blink comes as a quick pair. */
  doubleChance?: number
}

/** Lids are shut for this long at the start of each blink. */
export const BLINK_CLOSED_S = 0.07
/** The second blink of a pair starts this long after the first. */
export const DOUBLE_BLINK_GAP_S = 0.3

export function nextBlinkGap(
  random: () => number = Math.random,
  minMs = 3000,
  maxMs = 7000,
) {
  return minMs + Math.floor(random() * (maxMs - minMs))
}

/**
 * Calls `onBlink` every 3–7 s (randomised, never a metronome); about one
 * blink in five is a double. Returns a stop function.
 */
export function startBlinkScheduler(
  onBlink: (double: boolean) => void,
  {
    random = Math.random,
    minMs = 3000,
    maxMs = 7000,
    doubleChance = 0.2,
  }: BlinkOptions = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const schedule = () => {
    timer = setTimeout(
      () => {
        if (stopped) return
        onBlink(random() < doubleChance)
        schedule()
      },
      nextBlinkGap(random, minMs, maxMs),
    )
  }
  schedule()
  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Whether any blink started at one of `starts` has the lids shut at `now`. */
export function blinkShut(starts: readonly number[], now: number) {
  return starts.some((start) => now >= start && now - start < BLINK_CLOSED_S)
}
