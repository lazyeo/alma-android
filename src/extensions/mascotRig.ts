import { useSyncExternalStore } from 'react'

/** One eye's box on the base image, in rig pixels. */
export interface MascotRigEye {
  x: number
  y: number
  w: number
  h: number
  /** Iris centre and radii: `[cx, cy, rx, ry]`. */
  iris: [number, number, number, number]
  /** Where the upper lash line sits, for marks drawn above the eye. */
  lashY: number
}

/**
 * Geometry for a layered raster face. The base image is the face without
 * eyes; each eye is three layers the size of its box (white, iris, lid);
 * the mouth is drawn procedurally around `mouth`.
 */
export interface MascotRigGeometry {
  size: [number, number]
  eyes: { L: MascotRigEye; R: MascotRigEye }
  mouth: { cx: number; cy: number; w: number }
}

export interface MascotEyeLayers {
  white: string
  iris: string
  lid: string
}

/** Image URLs plus geometry; registered by a build-time extension. */
export interface MascotRigAssets {
  base: string
  eyes: { L: MascotEyeLayers; R: MascotEyeLayers }
  rig: MascotRigGeometry
}

let registered: MascotRigAssets | undefined
const listeners = new Set<() => void>()

/**
 * Supplies the raster character used wherever Alma's face appears. Without
 * a registration the app draws its built-in vector face.
 */
export function registerMascotRig(assets: MascotRigAssets | undefined) {
  registered = assets
  listeners.forEach((notify) => notify())
}

export const registeredMascotRig = () => registered

function subscribe(notify: () => void) {
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

export function useMascotRig() {
  return useSyncExternalStore(
    subscribe,
    registeredMascotRig,
    registeredMascotRig,
  )
}

/** True when every number a renderer reads is present and finite. */
export function validMascotRig(rig: unknown): rig is MascotRigGeometry {
  const r = rig as MascotRigGeometry | undefined
  const finite = (...values: unknown[]) =>
    values.every((value) => typeof value === 'number' && Number.isFinite(value))
  const eye = (e: MascotRigEye | undefined) =>
    Boolean(e) &&
    finite(e!.x, e!.y, e!.w, e!.h, e!.lashY) &&
    Array.isArray(e!.iris) &&
    e!.iris.length === 4 &&
    finite(...e!.iris) &&
    e!.w > 0 &&
    e!.h > 0
  return Boolean(
    r &&
    Array.isArray(r.size) &&
    finite(r.size[0], r.size[1]) &&
    r.size[0] > 0 &&
    r.size[1] > 0 &&
    eye(r.eyes?.L) &&
    eye(r.eyes?.R) &&
    finite(r.mouth?.cx, r.mouth?.cy, r.mouth?.w),
  )
}
