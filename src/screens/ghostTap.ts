const SWALLOWED = ['touchend', 'mousedown', 'mouseup', 'click'] as const

/**
 * A hold that completes while the finger is still down can unmount its own
 * button (stop → activity bar exits). The release then lands on whatever slid
 * under the finger — usually the composer — and focuses it, popping the
 * keyboard. Swallow that one release, capture-phase, for a short window.
 */
export function suppressNextTap(target: Document = document, ms = 800) {
  const swallow = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click') done()
  }
  const done = () => {
    window.clearTimeout(timer)
    for (const type of SWALLOWED)
      target.removeEventListener(type, swallow, true)
  }
  for (const type of SWALLOWED)
    target.addEventListener(type, swallow, { capture: true, passive: false })
  const timer = window.setTimeout(done, ms)
  return done
}
