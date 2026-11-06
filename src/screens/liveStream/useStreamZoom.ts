// Client-side zoom and pan of a live picture from the desktop (the Mac screen
// and the in-app browser). The transform is written straight to the layer's
// style during gestures, with no React render; the zoom chip's state updates
// only when a gesture settles.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { GestureAction } from '../remoteScreen/touchGestures'
import {
  clampView,
  IDENTITY_VIEW,
  isZoomed,
  oneToOneScale,
  panView,
  pinchView,
  settleView,
  viewTransform,
  zoomAround,
  type Size,
  type View,
} from '../remoteScreen/viewport'

/** The surface's box in client coordinates. */
export function measureSurface(element: HTMLElement | null | undefined) {
  const rect = element?.getBoundingClientRect()
  return {
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
  }
}

export function useStreamZoom({
  surfaceRef,
  layerRef,
  content,
  pixels,
  onView,
}: {
  surfaceRef: RefObject<HTMLElement>
  layerRef: RefObject<HTMLElement>
  /** The picture's size, which pointer mapping is relative to. */
  content: Size
  /** The picture's own pixels, for the 1:1 zoom. */
  pixels: Size
  /** Runs after every view change, e.g. to move an overlay. */
  onView?: (view: View) => void
}) {
  const viewRef = useRef<View>(IDENTITY_VIEW)
  const pinchBase = useRef<View>()
  const [zoom, setZoom] = useState({ scale: 1, oneToOne: false })
  const onViewRef = useRef(onView)
  onViewRef.current = onView

  const surfaceSize = useCallback(
    () => measureSurface(surfaceRef.current),
    [surfaceRef],
  )

  const applyView = useCallback(
    (view: View, settled = false) => {
      viewRef.current = view
      if (layerRef.current)
        layerRef.current.style.transform = viewTransform(view)
      onViewRef.current?.(view)
      if (settled) {
        // Measured only when a gesture settles, never per frame.
        const oneToOne = oneToOneScale(
          surfaceSize(),
          pixels,
          window.devicePixelRatio || 1,
        )
        setZoom({
          scale: view.scale,
          oneToOne: isZoomed(view) && Math.abs(view.scale - oneToOne) < 0.01,
        })
      }
    },
    [layerRef, pixels, surfaceSize],
  )

  // A new picture size (another display, window or page) starts at fit.
  useEffect(() => {
    pinchBase.current = undefined
    applyView(IDENTITY_VIEW, true)
  }, [applyView, content])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() =>
      applyView(clampView(viewRef.current, surfaceSize(), content), true),
    )
    observer.observe(surface)
    return () => observer.disconnect()
  }, [applyView, content, surfaceRef, surfaceSize])

  /** Applies a zoom gesture; false for actions that are not about zoom. */
  const zoomGesture = useCallback(
    (action: GestureAction) => {
      const size = surfaceSize()
      switch (action.type) {
        case 'pinch':
          pinchBase.current ??= viewRef.current
          applyView(
            pinchView(
              pinchBase.current,
              action.startCentroid,
              action.startDistance,
              action.centroid,
              action.distance,
              size,
              content,
            ),
          )
          return true
        case 'pinch-end':
          pinchBase.current = undefined
          applyView(settleView(viewRef.current, size, content), true)
          return true
        case 'reset-zoom':
          pinchBase.current = undefined
          applyView(IDENTITY_VIEW, true)
          return true
        case 'pan':
          applyView(panView(viewRef.current, action.delta, size, content))
          return true
        default:
          return false
      }
    },
    [applyView, content, surfaceSize],
  )

  /** The zoom chip: fit → 1:1 (or 2× when 1:1 is not larger) → fit. */
  const cycleZoom = useCallback(() => {
    const size = surfaceSize()
    if (isZoomed(viewRef.current)) {
      applyView(IDENTITY_VIEW, true)
      return
    }
    const target = oneToOneScale(size, pixels, window.devicePixelRatio || 1)
    applyView(
      zoomAround(
        viewRef.current,
        { x: size.width / 2, y: size.height / 2 },
        target > 1 ? target : 2,
        size,
        content,
      ),
      true,
    )
  }, [applyView, content, pixels, surfaceSize])

  return {
    viewRef,
    zoom,
    zoomed: zoom.scale > 1,
    surfaceSize,
    applyView,
    zoomGesture,
    cycleZoom,
  }
}
