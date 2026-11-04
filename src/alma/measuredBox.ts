import { useEffect, useRef, type RefObject } from 'react'
import { almaMotionState, subscribeAlmaMotion } from './almaExpand'

/**
 * Keeps an element's on-screen box current without measuring in a tap:
 * a ResizeObserver callback runs right after layout (reading a box there
 * forces nothing), and a window resize or the end of an Alma transition
 * re-measures after the next paint. Nothing is recorded while a transition
 * runs, since every box then includes its recede or rise transform.
 */
export function useMeasuredBox(
  ref: RefObject<HTMLElement>,
  enabled: boolean,
  record: (element: HTMLElement) => void,
) {
  const latest = useRef(record)
  latest.current = record
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const measure = () => {
      if (!element.isConnected || almaMotionState().running) return
      if (element.closest('[data-pressed]')) return
      latest.current(element)
    }
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    // After the next paint, layout is clean again.
    const afterPaint = () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      frame = requestAnimationFrame(() => {
        timer = setTimeout(measure, 0)
      })
    }
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(measure)
      observer.observe(element)
    } else afterPaint()
    window.addEventListener('resize', afterPaint)
    let wasRunning = almaMotionState().running
    const unsubscribe = subscribeAlmaMotion(() => {
      const running = almaMotionState().running
      if (wasRunning && !running) afterPaint()
      wasRunning = running
    })
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', afterPaint)
      unsubscribe()
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [enabled, ref])
}
