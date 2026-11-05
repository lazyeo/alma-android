import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  validMascotRig,
  type MascotRigAssets,
} from '../../extensions/mascotRig'
import { useAlmaMotionRunning } from '../almaExpand'
import type { FaceActivity, FaceMood } from '../faceState'
import { useReducedMotion } from '../useReducedMotion'
import { startBlinkScheduler } from './blink'
import { RigEngine } from './engine'
import {
  RigPainter,
  loadRigImages,
  paintStill,
  prepareRigLayers,
  readyRigLayers,
  type RigImages,
  type ScaledRigLayers,
} from './paint'

/** Device pixels per CSS pixel, capped: a 3x avatar is already crisp. */
export function rigPixelRatio(ratio = window.devicePixelRatio) {
  return Math.min(Math.max(ratio || 1, 1), 3)
}

/**
 * CSS sizes her face is drawn at: message avatars, the rail and /alma
 * header, the phone tab bar (NAV_FACE_SIZE). Their layers are rendered as
 * soon as the rig loads, so a face mounting mid-transition paints on its
 * first commit.
 */
export const RIG_FACE_SIZES = [28, 36, 60] as const

/** The output (device pixel) size a face of `size` CSS pixels draws at. */
export function rigOutputPixels(size: number, ratio = rigPixelRatio()) {
  return Math.round(size * ratio)
}

/**
 * Animate only while someone can see it: on screen and the page visible.
 * Static copies and reduced motion never animate, and neither does any
 * face while the /alma expand runs: a live canvas inside a transition
 * snapshot would be re-rastered every frame.
 */
export function shouldAnimate({
  animated,
  intersecting,
  pageVisible,
  transitioning = false,
}: {
  animated: boolean
  intersecting: boolean
  pageVisible: boolean
  transitioning?: boolean
}) {
  return animated && intersecting && pageVisible && !transitioning
}

// Decoded layers per rig, so a face that remounts (the /alma header after
// the expand) paints on its first commit instead of a blank frame.
const loadedImages = new WeakMap<MascotRigAssets, RigImages>()

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
  const pixels = rigOutputPixels(size)
  const readyFor = (images: RigImages | undefined) =>
    (images && readyRigLayers(images, pixels)) ?? null
  const [layers, setLayers] = useState<ScaledRigLayers | null>(() =>
    readyFor(loadedImages.get(assets)),
  )
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
  const transitioning = useAlmaMotionRunning()
  const running = shouldAnimate({
    animated,
    intersecting,
    pageVisible,
    transitioning,
  })

  useEffect(() => {
    let cancelled = false
    if (!validMascotRig(assets.rig)) {
      unavailable.current?.()
      return
    }
    const ready = readyFor(loadedImages.get(assets))
    if (ready) {
      setLayers(ready)
      return
    }
    const images = loadedImages.get(assets)
    const loading = images
      ? Promise.resolve(images)
      : loadRigImages(assets).then((loaded) => {
          loadedImages.set(assets, loaded)
          // Every size she is shown at, once, at rig load.
          for (const face of RIG_FACE_SIZES)
            void prepareRigLayers(
              loaded,
              assets.rig,
              rigOutputPixels(face),
            ).catch(() => undefined)
          return loaded
        })
    loading
      .then((loaded) => prepareRigLayers(loaded, assets.rig, pixels))
      .then(
        (prepared) => {
          if (!cancelled) setLayers(prepared)
        },
        () => {
          if (!cancelled) unavailable.current?.()
        },
      )
    return () => {
      cancelled = true
    }
    // `readyFor` only reads `pixels`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, pixels])

  // A size change leaves the old layers in state until the new ones land.
  const current = layers?.pixels === pixels ? layers : null
  // Built only once layers exist, i.e. the geometry has been validated.
  const painter = useRef<RigPainter>()
  const painterAssets = useRef<MascotRigAssets>()
  if (current && painterAssets.current !== assets) {
    painter.current = new RigPainter(assets.rig, undefined, assets.accessories)
    painterAssets.current = assets
  }

  // Static: one settled frame per change of expression. Still copies share
  // one composited frame per expression and size.
  useEffect(() => {
    if (running || !current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !painter.current) return
    if (still)
      paintStill(ctx, painter.current, current, `${mood}|${activity}`, () =>
        new RigEngine().settle(mood, activity),
      )
    else
      painter.current.paint(
        ctx,
        current,
        engine.current!.settle(mood, activity),
      )
  }, [running, current, still, mood, activity])

  // Animated: a rAF loop and blink timer, only while visible.
  useEffect(() => {
    if (!running || !current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !painter.current) return
    const rig = engine.current!
    const draw = painter.current
    const scaled = current
    const start = epoch.current!
    const seconds = () => (performance.now() - start) / 1000
    let last = seconds()
    let frame = 0
    const tick = () => {
      const now = seconds()
      const { mood: m, activity: a } = latest.current
      draw.paint(ctx, scaled, rig.update(now, now - last, m, a))
      last = now
      frame = requestAnimationFrame(tick)
    }
    // Draw now rather than leave the canvas blank until the next frame.
    draw.paint(
      ctx,
      scaled,
      rig.update(last, 0, latest.current.mood, latest.current.activity),
    )
    frame = requestAnimationFrame(tick)
    const stopBlinking = startBlinkScheduler((double) =>
      rig.blink(seconds(), double),
    )
    return () => {
      cancelAnimationFrame(frame)
      stopBlinking()
    }
  }, [running, current])

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
