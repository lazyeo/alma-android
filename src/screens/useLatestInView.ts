import { useEffect, type RefObject } from 'react'
import { isScrolledAwayFromLatest } from './generationActivity'

/**
 * Keeps the latest message in view while the message list changes size:
 * the composer opening its options (frame by frame while it animates) or
 * the soft keyboard shrinking the window. Without it the list keeps its
 * scrollTop, so a taller composer seems to slide over the last messages.
 * A reader scrolled up into the history is left where they are.
 */
export function useLatestInView(
  scroller: RefObject<HTMLElement>,
  /** False while the list is not mounted (re-attaches once it is). */
  mounted = true,
) {
  useEffect(() => {
    const element = scroller.current
    if (!mounted || !element || typeof ResizeObserver === 'undefined') return
    // Whether the reader was at the latest message before the size change;
    // a shrink moves no scrollTop, so no scroll event says so afterwards.
    let lastHeight = element.clientHeight
    // Measured against the height last observed, not the live one: when the
    // keyboard rises while the options open, a scroll event (from our own
    // pin) can land after the window shrank but before the observer runs,
    // and the live height would wrongly say the reader left the latest.
    const away = () =>
      isScrolledAwayFromLatest({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: lastHeight,
      })
    let atLatest = !away()
    const track = () => {
      atLatest = !away()
    }
    const observer = new ResizeObserver(() => {
      const height = element.clientHeight
      if (height === lastHeight) return
      lastHeight = height
      if (atLatest) element.scrollTop = element.scrollHeight
    })
    element.addEventListener('scroll', track, { passive: true })
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', track)
      observer.disconnect()
    }
  }, [scroller, mounted])
}
