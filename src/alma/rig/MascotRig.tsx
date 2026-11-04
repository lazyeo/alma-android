import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  validMascotRig,
  type MascotRigAssets,
} from '../../extensions/mascotRig'
import type { FaceActivity, FaceMood } from '../faceState'
import { useReducedMotion } from '../useReducedMotion'
import { startBlinkScheduler } from './blink'
import { RigEngine } from './engine'
import { RigPainter, loadRigImages, type RigImages } from './paint'

/** Device pixels per CSS pixel, capped: a 3x avatar is already crisp. */
export function rigPixelRatio(ratio = window.devicePixelRatio) {
  return Math.min(Math.max(ratio || 1, 1), 3)
}

/**
 * Animate only while someone can see it: on screen and the page visible.
 * Static copies and reduced motion never animate.
 */
export function shouldAnimate({
  animated,
  intersecting,
  pageVisible,
}: {
  animated: boolean
  intersecting: boolean
  pageVisible: boolean
}) {
  return animated && intersecting && pageVisible
}

function useOnScreen(target: RefObject<Element>, enabled: boolean) {
  const [intersecting, setIntersecting] = useState(true)
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )
  useEffect(() => {
    if (!enabled) return
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    const element = target.current
    let observer: IntersectionObserver | undefined
    if (element && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(([entry]) =>
        setIntersecting(entry?.isIntersecting ?? true),
      )
      observer.observe(element)
    }
    return () => {
      document.removeEventListener('visibilitychange', update)
      observer?.disconnect()
    }
  }, [enabled, target])
  return { intersecting, pageVisible }
}

/**
 * A layered raster character drawn on a canvas: springs drive every
 * parameter, she blinks, glances and breathes when idle, and her mood and
 * activity shape the pose. `onUnavailable` fires if the art cannot load so
 * the caller can fall back.
 */
export function MascotRig({
  assets,
  size,
  mood = 'neutral',
  activity = 'idle',
  still = false,
  className = '',
  onUnavailable,
}: {
  assets: MascotRigAssets
  size: number
  mood?: FaceMood
  activity?: FaceActivity
  still?: boolean
  className?: string
  onUnavailable?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const animated = !still && !reduced
  const [images, setImages] = useState<RigImages | null>(null)
  const engine = useRef<RigEngine>()
  engine.current ??= new RigEngine()
  // One clock per face, so pausing offscreen never rewinds its timers.
  const epoch = useRef<number>()
  epoch.current ??= performance.now()
  const latest = useRef({ mood, activity })
  latest.current = { mood, activity }
  const unavailable = useRef(onUnavailable)
  unavailable.current = onUnavailable
  const { intersecting, pageVisible } = useOnScreen(canvasRef, animated)
  const running = shouldAnimate({ animated, intersecting, pageVisible })

  useEffect(() => {
    let cancelled = false
    if (!validMascotRig(assets.rig)) {
      unavailable.current?.()
      return
    }
    loadRigImages(assets).then(
      (loaded) => {
        if (!cancelled) setImages(loaded)
      },
      () => {
        if (!cancelled) unavailable.current?.()
      },
    )
    return () => {
      cancelled = true
    }
  }, [assets])

  const pixels = Math.round(size * rigPixelRatio())
  const painter = useRef<{ painter: RigPainter; images: RigImages }>()
  if (images && painter.current?.images !== images)
    painter.current = { painter: new RigPainter(images, assets.rig), images }

  // Static: one settled frame per change of expression.
  useEffect(() => {
    if (running || !images) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !painter.current) return
    painter.current.painter.paint(
      ctx,
      pixels,
      engine.current!.settle(mood, activity),
    )
  }, [running, images, pixels, mood, activity])

  // Animated: a rAF loop and blink timer, only while visible.
  useEffect(() => {
    if (!running || !images) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !painter.current) return
    const rig = engine.current!
    const draw = painter.current.painter
    const start = epoch.current!
    const seconds = () => (performance.now() - start) / 1000
    let last = seconds()
    let frame = 0
    const tick = () => {
      const now = seconds()
      const { mood: m, activity: a } = latest.current
      draw.paint(ctx, pixels, rig.update(now, now - last, m, a))
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const stopBlinking = startBlinkScheduler((double) =>
      rig.blink(seconds(), double),
    )
    return () => {
      cancelAnimationFrame(frame)
      stopBlinking()
    }
  }, [running, images, pixels])

  return (
    <canvas
      ref={canvasRef}
      className={`mascot-rig${className ? ` ${className}` : ''}`}
      width={pixels}
      height={pixels}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-mood={mood}
      data-activity={activity}
      data-animated={animated ? 'true' : 'false'}
      data-running={running ? 'true' : 'false'}
    />
  )
}
