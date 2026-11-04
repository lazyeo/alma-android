// Client-side zoom and pan of the remote screen. The desktop protocol has no
// zoom, so every pointer position sent to the desktop goes through the inverse
// of this transform.
//
// Coordinates:
// - surface: CSS px inside the screen surface (pointer clientX/Y minus the
//   surface's bounding rect). Device pixel ratio does not enter the mapping;
//   it only matters for `oneToOneScale`.
// - layer: CSS px inside the transformed layer before `view` is applied.
// - desktop: 0..1 across the captured display or window.
//
// The layer is rendered with `transform: translate(x, y) scale(scale)` and
// `transform-origin: 0 0`, so surface = layer * scale + (x, y).

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface View {
  scale: number
  x: number
  y: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
/** A pinch that ends below this snaps back to fit. */
export const SNAP_ZOOM = 1.03
/** Auto-pan keeps a target this far from the edge, or a quarter of the view. */
export const EDGE_MARGIN = 56

export const IDENTITY_VIEW: View = Object.freeze({ scale: 1, x: 0, y: 0 })

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const clampZoom = (scale: number) =>
  Number.isFinite(scale) ? clamp(scale, MIN_ZOOM, MAX_ZOOM) : MIN_ZOOM

/** Where `object-fit: contain` puts the content inside the container. */
export function fitRect(container: Size, content: Size): Rect {
  if (
    !(container.width > 0 && container.height > 0) ||
    !(content.width > 0 && content.height > 0)
  )
    return {
      left: 0,
      top: 0,
      width: Math.max(0, container.width),
      height: Math.max(0, container.height),
    }
  const fit = Math.min(
    container.width / content.width,
    container.height / content.height,
  )
  const width = content.width * fit
  const height = content.height * fit
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  }
}

/** Surface point → normalized desktop point. `inside` is false over letterboxing. */
export function surfaceToDesktop(
  point: Point,
  container: Size,
  content: Size,
  view: View,
) {
  const rect = fitRect(container, content)
  const scale = view.scale > 0 ? view.scale : 1
  const layerX = (point.x - view.x) / scale
  const layerY = (point.y - view.y) / scale
  const x = rect.width > 0 ? (layerX - rect.left) / rect.width : 0
  const y = rect.height > 0 ? (layerY - rect.top) / rect.height : 0
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  }
}

/** Normalized desktop point → surface point. */
export function desktopToSurface(
  point: Point,
  container: Size,
  content: Size,
  view: View,
): Point {
  const rect = fitRect(container, content)
  return {
    x: (rect.left + point.x * rect.width) * view.scale + view.x,
    y: (rect.top + point.y * rect.height) * view.scale + view.y,
  }
}

/** A surface-pixel movement as a normalized desktop movement at this zoom. */
export function surfaceDeltaToDesktop(
  delta: Point,
  container: Size,
  content: Size,
  view: View,
): Point {
  const rect = fitRect(container, content)
  const scale = view.scale > 0 ? view.scale : 1
  return {
    x: rect.width > 0 ? delta.x / (rect.width * scale) : 0,
    y: rect.height > 0 ? delta.y / (rect.height * scale) : 0,
  }
}

const clampAxis = (
  offset: number,
  scale: number,
  start: number,
  length: number,
  viewport: number,
) => {
  const scaled = length * scale
  // Content narrower than the view stays centred, as at fit.
  const value =
    scaled <= viewport
      ? (viewport - scaled) / 2 - start * scale
      : clamp(offset, viewport - (start + length) * scale, -start * scale)
  // Avoid -0, which would leak into equality checks and CSS.
  return value || 0
}

/** Keeps zoom in range and never pans past the content's edges. */
export function clampView(view: View, container: Size, content: Size): View {
  const scale = clampZoom(view.scale)
  const rect = fitRect(container, content)
  return {
    scale,
    x: clampAxis(view.x, scale, rect.left, rect.width, container.width),
    y: clampAxis(view.y, scale, rect.top, rect.height, container.height),
  }
}

/** Zooms to `scale` keeping the content under `anchor` (surface px) in place. */
export function zoomAround(
  view: View,
  anchor: Point,
  scale: number,
  container: Size,
  content: Size,
): View {
  const next = clampZoom(scale)
  const layerX = (anchor.x - view.x) / view.scale
  const layerY = (anchor.y - view.y) / view.scale
  return clampView(
    { scale: next, x: anchor.x - layerX * next, y: anchor.y - layerY * next },
    container,
    content,
  )
}

/**
 * Two-finger pinch from the view at the start of the gesture: the content
 * under the starting centroid follows the current centroid, and the zoom
 * follows the change in finger distance.
 */
export function pinchView(
  start: View,
  startCentroid: Point,
  startDistance: number,
  centroid: Point,
  distance: number,
  container: Size,
  content: Size,
): View {
  const ratio = startDistance > 0 && distance > 0 ? distance / startDistance : 1
  const next = clampZoom(start.scale * ratio)
  const layerX = (startCentroid.x - start.x) / start.scale
  const layerY = (startCentroid.y - start.y) / start.scale
  return clampView(
    {
      scale: next,
      x: centroid.x - layerX * next,
      y: centroid.y - layerY * next,
    },
    container,
    content,
  )
}

/** End of a pinch: snap back to fit when barely zoomed. */
export function settleView(view: View, container: Size, content: Size): View {
  if (view.scale < SNAP_ZOOM) return IDENTITY_VIEW
  return clampView(view, container, content)
}

export function panView(
  view: View,
  delta: Point,
  container: Size,
  content: Size,
): View {
  return clampView(
    { ...view, x: view.x + delta.x, y: view.y + delta.y },
    container,
    content,
  )
}

export const edgeMargin = (length: number) =>
  Math.min(EDGE_MARGIN, Math.max(0, length) / 4)

/**
 * When zoomed, pans just enough to keep a surface point at least the edge
 * margin inside the view (bounded by the content's edges).
 */
export function keepPointVisible(
  view: View,
  point: Point,
  container: Size,
  content: Size,
): View {
  if (view.scale <= MIN_ZOOM) return view
  const shift = (value: number, length: number) => {
    const margin = edgeMargin(length)
    if (value < margin) return margin - value
    if (value > length - margin) return length - margin - value
    return 0
  }
  const dx = shift(point.x, container.width)
  const dy = shift(point.y, container.height)
  if (!dx && !dy) return view
  return panView(view, { x: dx, y: dy }, container, content)
}

/**
 * The zoom at which one pixel of `content` (the stream's own pixels) covers
 * one device pixel of the phone. Never below fit.
 */
export function oneToOneScale(
  container: Size,
  content: Size,
  devicePixelRatio: number,
) {
  const rect = fitRect(container, content)
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  if (!(rect.width > 0)) return MIN_ZOOM
  return clampZoom(content.width / (rect.width * dpr))
}

export const isZoomed = (view: View) => view.scale > MIN_ZOOM

export const zoomPercent = (view: View) => Math.round(view.scale * 100)

export const viewTransform = (view: View) =>
  `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`
