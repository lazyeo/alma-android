import type {
  MascotRigEye,
  MascotRigGeometry,
} from '../../extensions/mascotRig'

/** One lens, in rig pixels. */
export interface GlassesLens {
  cx: number
  cy: number
  rx: number
  ry: number
}

/** A pair of round glasses fitted to a rig's eye boxes, in rig pixels. */
export interface GlassesGeometry {
  L: GlassesLens
  R: GlassesLens
  /** Rim stroke width before the device-pixel floor. */
  rim: number
  /** The bridge's control point between the lenses' inner edges. */
  bridge: { x: number; y: number }
  /** How far each temple arm reaches out past its lens. */
  temple: number
}

// The lens is a touch larger than the eye box so the rim never cuts into
// the white, and both lenses share one size so the pair reads as a frame.
const LENS_X = 1.1
const LENS_Y = 1.06

const centre = (e: MascotRigEye) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 })

/**
 * Fits glasses to the eye boxes: each lens is centred on its eye box (the
 * eye white fills the box; the iris may sit off-centre by design), with a
 * shared radius from the larger box.
 */
export function glassesGeometry(rig: MascotRigGeometry): GlassesGeometry {
  const { L, R } = rig.eyes
  const rx = (Math.max(L.w, R.w) / 2) * LENS_X
  const ry = (Math.max(L.h, R.h) / 2) * LENS_Y
  const cl = centre(L)
  const cr = centre(R)
  const ew = (L.w + R.w) / 2
  return {
    L: { cx: cl.x, cy: cl.y, rx, ry },
    R: { cx: cr.x, cy: cr.y, rx, ry },
    rim: ew * 0.045,
    bridge: { x: (cl.x + cr.x) / 2, y: Math.min(cl.y, cr.y) - ry * 0.32 },
    temple: rx * 0.34,
  }
}

/**
 * Rim width in rig pixels for a face drawn at `k` device pixels per rig
 * pixel: the art's own width, but never thinner than one device pixel, so
 * the frame survives at tab-bar sizes.
 */
export function rimWidth(glasses: GlassesGeometry, k: number) {
  return Math.max(glasses.rim, 1 / Math.max(k, 1e-6))
}

// Character art colours, not theme colours: an ink rim and a faint sage
// tint, light enough that blinks and gaze stay visible through it.
const RIM = '#1D1D1F'
const TINT = 'rgba(156, 175, 136, 0.18)'
const GLINT = 'rgba(255, 255, 255, 0.45)'

/** Draws the glasses in rig space (inside the head transform). */
export function paintGlasses(
  ctx: CanvasRenderingContext2D,
  glasses: GlassesGeometry,
  k: number,
) {
  const { L, R, bridge, temple } = glasses
  const width = rimWidth(glasses, k)
  ctx.save()
  ctx.lineCap = ctx.lineJoin = 'round'
  ctx.fillStyle = TINT
  for (const lens of [L, R]) {
    ctx.beginPath()
    ctx.ellipse(lens.cx, lens.cy, lens.rx, lens.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // a glint across the upper outer quarter of each lens
  ctx.strokeStyle = GLINT
  ctx.lineWidth = width * 0.8
  for (const [lens, dir] of [
    [L, -1],
    [R, 1],
  ] as const) {
    ctx.beginPath()
    ctx.ellipse(
      lens.cx,
      lens.cy,
      lens.rx * 0.72,
      lens.ry * 0.72,
      0,
      dir < 0 ? Math.PI * 1.08 : Math.PI * 1.62,
      dir < 0 ? Math.PI * 1.38 : Math.PI * 1.92,
    )
    ctx.stroke()
  }
  ctx.strokeStyle = RIM
  ctx.lineWidth = width
  ctx.beginPath()
  for (const lens of [L, R]) {
    ctx.moveTo(lens.cx + lens.rx, lens.cy)
    ctx.ellipse(lens.cx, lens.cy, lens.rx, lens.ry, 0, 0, Math.PI * 2)
  }
  // bridge from a point just above each inner edge, arching over the nose
  const lift = 0.2
  const reach = Math.sqrt(1 - lift * lift)
  ctx.moveTo(L.cx + L.rx * reach, L.cy - L.ry * lift)
  ctx.quadraticCurveTo(
    bridge.x,
    bridge.y,
    R.cx - R.rx * reach,
    R.cy - R.ry * lift,
  )
  // temple arms from the outer edges, slightly rising
  ctx.moveTo(L.cx - L.rx, L.cy - L.ry * 0.25)
  ctx.lineTo(L.cx - L.rx - temple, L.cy - L.ry * 0.38)
  ctx.moveTo(R.cx + R.rx, R.cy - R.ry * 0.25)
  ctx.lineTo(R.cx + R.rx + temple, R.cy - R.ry * 0.38)
  ctx.stroke()
  ctx.restore()
}
