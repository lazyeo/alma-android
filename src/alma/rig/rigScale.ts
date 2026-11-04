// Build-time helper for raster mascot rigs: scripts/prepare-mascot.mjs uses
// it to shrink the official art and its geometry together.
import type {
  MascotRigEye,
  MascotRigGeometry,
} from '../../extensions/mascotRig'

/** Factor that brings the longer side down to `maxSide`; never upscales. */
export function rigScaleFactor(rig: MascotRigGeometry, maxSide: number) {
  const longest = Math.max(rig.size[0], rig.size[1])
  return maxSide > 0 && longest > maxSide ? maxSide / longest : 1
}

const fine = (value: number) => Math.round(value * 100) / 100
const whole = (value: number) => Math.max(1, Math.round(value))

/**
 * Scales every coordinate by `factor`. Image sizes (the canvas and each eye
 * layer) become whole pixels, because the eye PNGs are resized to exactly
 * those dimensions and drawn 1:1 into their boxes; positions keep two
 * decimals.
 */
export function scaleRig(
  rig: MascotRigGeometry,
  factor: number,
): MascotRigGeometry {
  if (factor === 1) return rig
  const eye = (e: MascotRigEye): MascotRigEye => ({
    x: fine(e.x * factor),
    y: fine(e.y * factor),
    w: whole(e.w * factor),
    h: whole(e.h * factor),
    iris: e.iris.map((value) => fine(value * factor)) as MascotRigEye['iris'],
    lashY: fine(e.lashY * factor),
  })
  return {
    size: [whole(rig.size[0] * factor), whole(rig.size[1] * factor)],
    eyes: { L: eye(rig.eyes.L), R: eye(rig.eyes.R) },
    mouth: {
      cx: fine(rig.mouth.cx * factor),
      cy: fine(rig.mouth.cy * factor),
      w: fine(rig.mouth.w * factor),
    },
  }
}
