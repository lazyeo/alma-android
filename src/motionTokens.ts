// Script-side mirror of the motion tokens in styles.css, for timers that
// wait out a CSS exit and for WAAPI motion. designTokens.test.ts keeps the
// two in step.

export const DUR_PRESS_MS = 100
export const DUR_FAST_MS = 160
export const DUR_PANEL_MS = 250
export const EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

/** Slack after a CSS exit before its element is unmounted. */
const EXIT_SLACK_MS = 20

/** A fade or rise on `--dur-fast`. */
export const FADE_EXIT_MS = DUR_FAST_MS + EXIT_SLACK_MS
/** A row that fades on `--dur-press`, then closes its slot on `--dur-fast`. */
export const ROW_EXIT_MS = DUR_PRESS_MS + DUR_FAST_MS + EXIT_SLACK_MS
/** A section that fades on `--dur-press`, then closes on `--dur-panel`. */
export const COLLAPSE_EXIT_MS = DUR_PRESS_MS + DUR_PANEL_MS + EXIT_SLACK_MS

/** True while a route or `/alma` transition owns the frame budget. */
export function navigationMotionRunning(root = document.documentElement) {
  return (
    root.hasAttribute('data-nav-motion') ||
    root.hasAttribute('data-alma-motion')
  )
}

export function reducedMotionPreferred() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
