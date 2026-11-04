import { useEffect, useRef, useState, type RefObject } from 'react'
import { DUR_HANDOFF_MS, reducedMotionPreferred } from '../motionTokens'

/**
 * The shell's hand-off to the real thread once the /alma expand has landed:
 *
 * - `shell`: only the cheap shell is mounted (the expand and its entrance);
 * - `mounting`: the real thread mounts behind the opaque shell, inert, and
 *   renders, scrolls to her latest message and paints;
 * - `fading`: the shell fades out over `--dur-handoff` (opacity only),
 *   uncovering the real thread already in place;
 * - `real`: the shell is gone.
 *
 * Reduced motion skips `fading` but still waits for `mounting` to finish,
 * so no frame shows a half-rendered thread.
 */
export type HandoffPhase = 'shell' | 'mounting' | 'fading' | 'real'

/** The shell's fade plus slack before it unmounts. */
export const HANDOFF_EXIT_MS = DUR_HANDOFF_MS + 20
/** Give up waiting for a settled list and hand off anyway. */
export const HANDOFF_READY_TIMEOUT_MS = 800
/** Frames the list must hold still at its bottom before it counts as ready. */
const STABLE_FRAMES = 2

export interface ReadyScheduler {
  frame(callback: () => void): number
  cancel(handle: number): void
  now(): number
}

const browserScheduler: ReadyScheduler = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
}

/**
 * Calls `onReady` once the thread in `layer` has rendered its list, scrolled
 * to the bottom and held still for two frames, and then painted (two more
 * frames). A thread without a list (missing, still loading) hands off after
 * `HANDOFF_READY_TIMEOUT_MS`. Returns a cancel function.
 */
export function watchThreadReady(
  layer: HTMLElement,
  onReady: () => void,
  scheduler: ReadyScheduler = browserScheduler,
  timeoutMs = HANDOFF_READY_TIMEOUT_MS,
) {
  const started = scheduler.now()
  let handle = 0
  let cancelled = false
  let previous = ''
  let stable = 0
  const paint = (remaining: number) => {
    handle = scheduler.frame(() => {
      if (cancelled) return
      if (remaining > 1) paint(remaining - 1)
      else onReady()
    })
  }
  const check = () => {
    if (cancelled) return
    const scroller = layer.querySelector<HTMLElement>('.message-scroll')
    if (scroller) {
      const { scrollHeight, scrollTop, clientHeight } = scroller
      const rows = scroller.querySelectorAll('[data-row-id]').length
      const atBottom = scrollHeight - scrollTop - clientHeight <= 1
      const signature = `${rows}:${scrollHeight}:${scrollTop}`
      stable = atBottom && signature === previous ? stable + 1 : 0
      previous = signature
      if (stable >= STABLE_FRAMES) return paint(2)
    }
    if (scheduler.now() - started >= timeoutMs) return paint(2)
    handle = scheduler.frame(check)
  }
  handle = scheduler.frame(check)
  return () => {
    cancelled = true
    scheduler.cancel(handle)
  }
}

/**
 * Drives the phases for AlmaScreen. `deferred` is the expand's "nothing
 * heavy yet" flag; `realLayer` holds the real thread while it mounts.
 */
export function useAlmaHandoff(
  deferred: boolean,
  realLayer: RefObject<HTMLElement>,
  options: { reduced?: () => boolean; scheduler?: ReadyScheduler } = {},
) {
  const [phase, setPhase] = useState<HandoffPhase>(() =>
    deferred ? 'shell' : 'real',
  )
  const latest = useRef(options)
  latest.current = options
  // Adjusted during render, so the real thread mounts in the same commit
  // that ends the deferral.
  if (!deferred && phase === 'shell') setPhase('mounting')
  useEffect(() => {
    if (phase !== 'mounting') return
    const layer = realLayer.current
    const reduced = latest.current.reduced ?? reducedMotionPreferred
    const done = () => setPhase(reduced() ? 'real' : 'fading')
    if (!layer) {
      done()
      return
    }
    return watchThreadReady(layer, done, latest.current.scheduler)
  }, [phase, realLayer])
  useEffect(() => {
    if (phase !== 'fading') return
    const timer = setTimeout(() => setPhase('real'), HANDOFF_EXIT_MS)
    return () => clearTimeout(timer)
  }, [phase])
  return phase
}
