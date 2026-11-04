import { useEffect, useRef, useState, type RefObject } from 'react'
import { haptic } from '../haptics'
import { overlayCount } from '../overlayStack'
import {
  pullRefreshDistance,
  shouldClaimPullRefresh,
  shouldCommitPullRefresh,
} from './pullToRefresh'

// Text editing and rows that own their own drags never start a pull.
const BLOCKED_TARGETS =
  'input, textarea, [contenteditable="true"], .gtd-swipe-row'

type Drag = { startX: number; startY: number; claimed: boolean }

/**
 * Pull down at the top of `scrollerRef` to run `onRefresh`.
 *
 * Touch events rather than the pointer events other gestures use: the
 * scroller keeps native vertical panning, and the browser cancels a pointer
 * stream as soon as it starts a pan, while touchmove keeps arriving.
 */
export function usePullToRefresh(
  scrollerRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
) {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const refreshingRef = useRef(false)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let drag: Drag | null = null
    let pulled = 0

    const onStart = (event: TouchEvent) => {
      drag = null
      const touch = event.touches[0]
      if (
        !touch ||
        event.touches.length > 1 ||
        refreshingRef.current ||
        overlayCount() > 0 ||
        scroller.scrollTop > 0 ||
        (event.target instanceof Element &&
          event.target.closest(BLOCKED_TARGETS))
      )
        return
      drag = { startX: touch.clientX, startY: touch.clientY, claimed: false }
    }
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!drag || !touch) return
      const dx = touch.clientX - drag.startX
      const dy = touch.clientY - drag.startY
      if (!drag.claimed) {
        if (!shouldClaimPullRefresh(dx, dy, scroller.scrollTop)) {
          // Once the user scrolls, swipes sideways, or pushes up, the
          // gesture belongs to someone else for the rest of this touch.
          if (Math.abs(dx) >= 10 || dy < 0 || scroller.scrollTop > 0)
            drag = null
          return
        }
        drag.claimed = true
      }
      // Claimed: keep the WebView from also drawing its overscroll glow.
      if (event.cancelable) event.preventDefault()
      pulled = pullRefreshDistance(dy)
      setDistance(pulled)
    }
    const onEnd = (event: TouchEvent) => {
      const claimed = drag?.claimed
      const commit =
        event.type === 'touchend' && shouldCommitPullRefresh(pulled)
      drag = null
      pulled = 0
      if (!claimed) return
      // No ghost-tap guard: a claimed, prevented pan never produces a click.
      setDistance(0)
      if (!commit) return
      void haptic('light')
      refreshingRef.current = true
      setRefreshing(true)
      void (async () => {
        try {
          await onRefreshRef.current()
        } catch (error) {
          console.warn('[pull-to-refresh] failed', error)
        } finally {
          refreshingRef.current = false
          setRefreshing(false)
        }
      })()
    }

    scroller.addEventListener('touchstart', onStart, { passive: true })
    // Non-passive so a claimed pull can cancel native overscroll.
    scroller.addEventListener('touchmove', onMove, { passive: false })
    scroller.addEventListener('touchend', onEnd)
    scroller.addEventListener('touchcancel', onEnd)
    return () => {
      scroller.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
      scroller.removeEventListener('touchend', onEnd)
      scroller.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollerRef])

  return { distance, refreshing }
}
