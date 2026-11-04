import type {
  MascotRigEye,
  MascotRigGeometry,
} from '../../extensions/mascotRig'
import type { RigFrame } from './engine'

export interface RigEyeImages {
  white: CanvasImageSource
  iris: CanvasImageSource
  lid: CanvasImageSource
}

export interface RigImages {
  base: CanvasImageSource
  eyes: { L: RigEyeImages; R: RigEyeImages }
}

/** A square window onto the rig, in rig pixels. */
export interface RigView {
  x: number
  y: number
  side: number
}

/**
 * Frames the head for a round avatar: centred between the eyes, sized from
 * the eye-to-mouth distance (a face is roughly six of those tall with its
 * hair), kept inside the image.
 */
export function portraitView(rig: MascotRigGeometry): RigView {
  const [width, height] = rig.size
  const { L, R } = rig.eyes
  const eyeX = (L.iris[0] + R.iris[0]) / 2
  const eyeY = (L.iris[1] + R.iris[1]) / 2
  const reach = Math.max(rig.mouth.cy - eyeY, 1)
  const side = Math.min(width, height, reach * 6.4)
  const cy = eyeY - reach * 0.6
  return {
    x: clamp(eyeX - side / 2, 0, width - side),
    y: clamp(cy - side / 2, 0, height - side),
    side,
  }
}

// Ink and mark colours belong to the character art, not the app theme.
const INK = '#000'
const OUTLINE = '#1D1D1F'
const BLUSH = (alpha: number) => `rgba(255, 110, 140, ${alpha})`
const GLOOM = (alpha: number) => `rgba(52, 70, 140, ${alpha})`
const SWEAT = '#BFE4FF'

type Context2D = CanvasRenderingContext2D

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))
  return canvas
}

/**
 * Composites one face per frame: the eyeless base, each eye built from its
 * white, iris (masked to the white and moved by gaze, scaled for pupil size)
 * and lid layers then squashed toward a low lid pivot, a procedural mouth,
 * and a few manga marks for feelings. Everything sits inside one head
 * transform (tilt and bob around the neck).
 */
export class RigPainter {
  private scratch: Record<'L' | 'R', HTMLCanvasElement>
  private base?: { canvas: HTMLCanvasElement; pixels: number }

  constructor(
    private images: RigImages,
    private rig: MascotRigGeometry,
    private view: RigView = portraitView(rig),
  ) {
    this.scratch = {
      L: makeCanvas(rig.eyes.L.w, rig.eyes.L.h),
      R: makeCanvas(rig.eyes.R.w, rig.eyes.R.h),
    }
  }

  /** The base pre-scaled once to the output resolution of the view. */
  private scaledBase(pixels: number) {
    if (this.base?.pixels === pixels) return this.base.canvas
    const [width, height] = this.rig.size
    const k = pixels / this.view.side
    const canvas = makeCanvas(width * k, height * k)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(this.images.base, 0, 0, canvas.width, canvas.height)
    }
    this.base = { canvas, pixels }
    return canvas
  }

  paint(ctx: Context2D, pixels: number, f: RigFrame) {
    const { rig, view } = this
    const [width, height] = rig.size
    const k = pixels / view.side
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, pixels, pixels)
    ctx.setTransform(k, 0, 0, k, -view.x * k, -view.y * k)
    // head: tilt around the neck, bob vertically
    const neckX = width * 0.5
    const neckY = height * 0.74
    ctx.translate(neckX, neckY + f.bob * height)
    ctx.rotate(f.tilt)
    ctx.translate(-neckX, -neckY)
    ctx.drawImage(this.scaledBase(pixels), 0, 0, width, height)
    this.eye(ctx, 'L', f.openL, f)
    this.eye(ctx, 'R', f.openR, f)
    this.mouth(ctx, f)
    this.marks(ctx, f)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  private eye(ctx: Context2D, side: 'L' | 'R', open: number, f: RigFrame) {
    const e = this.rig.eyes[side]
    const layers = this.images.eyes[side]
    const [icx, icy, rx, ry] = e.iris
    // lids meet low, like a real blink
    const pivot = icy + ry * 0.42
    const shown = Math.min(1, open)
    if (shown > 0.15) {
      const canvas = this.scratch[side]
      const sx = canvas.getContext('2d')
      if (sx) {
        sx.clearRect(0, 0, canvas.width, canvas.height)
        sx.globalCompositeOperation = 'source-over'
        sx.drawImage(layers.white, 0, 0)
        // the iris only shows where the white is
        sx.globalCompositeOperation = 'source-atop'
        const dx = f.gazeX * e.w * 0.05
        const dy = f.gazeY * e.h * 0.034
        const ix = icx - e.x + dx
        const iy = icy - e.y + dy
        sx.save()
        sx.translate(ix, iy)
        sx.scale(f.pupil, f.pupil)
        sx.translate(-ix, -iy)
        sx.drawImage(layers.iris, dx, dy)
        sx.restore()
        sx.globalCompositeOperation = 'source-over'
        sx.drawImage(layers.lid, 0, 0)
        ctx.save()
        ctx.translate(0, pivot)
        ctx.scale(1, shown)
        ctx.translate(0, -pivot)
        ctx.drawImage(canvas, 0, 0, e.w, e.h, e.x, e.y, e.w, e.h)
        ctx.restore()
      }
    }
    if (shown < 0.45) this.closedLid(ctx, side, e, shown, pivot, f)
  }

  /** One ink stroke for a shut eye: ∪ blinking, ∩ smiling, > < squeezed. */
  private closedLid(
    ctx: Context2D,
    side: 'L' | 'R',
    e: MascotRigEye,
    open: number,
    pivot: number,
    f: RigFrame,
  ) {
    const [icx, , rx] = e.iris
    const strength = 1 - Math.max(0, (open - 0.15) / 0.3)
    const left = icx - rx - e.w * 0.14
    const right = icx + rx + e.w * 0.12
    const y = pivot - e.h * 0.02
    ctx.save()
    ctx.globalAlpha = Math.min(1, strength * 1.2)
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.lineWidth = e.w * 0.06
    ctx.strokeStyle = INK
    ctx.beginPath()
    if (f.squint > 0.5) {
      const inner = side === 'L' ? right - e.w * 0.08 : left + e.w * 0.08
      const outer = side === 'L' ? left + e.w * 0.08 : right - e.w * 0.08
      const yy = y - e.h * 0.045
      ctx.moveTo(outer, yy - e.h * 0.17)
      ctx.lineTo(inner, yy)
      ctx.lineTo(outer, yy + e.h * 0.15)
      ctx.stroke()
      ctx.restore()
      return
    }
    const bow = f.closed || f.smile > 0.5 ? -e.h * 0.19 : e.h * 0.09
    ctx.moveTo(left, y - bow * 0.2)
    ctx.quadraticCurveTo(icx, y + bow, right, y - bow * 0.2)
    ctx.stroke()
    // a lash flick at the outer corner
    const corner = side === 'L' ? left : right
    const dir = side === 'L' ? -1 : 1
    ctx.lineWidth = e.w * 0.038
    ctx.beginPath()
    ctx.moveTo(corner, y - bow * 0.2)
    ctx.lineTo(corner + dir * e.w * 0.065, y - e.h * 0.056 - bow * 0.15)
    ctx.stroke()
    ctx.restore()
  }

  private mouth(ctx: Context2D, f: RigFrame) {
    const { cx: mx, cy: my, w } = this.rig.mouth
    // reference unit: the shapes were tuned on a 30 px mouth
    const m = w / 30
    const open = Math.max(0, f.mouthOpen)
    const smile = f.smile
    const half = w / 2 + (smile * 4 + open * 2 + f.wave * 5) * m
    ctx.save()
    ctx.fillStyle = ctx.strokeStyle = INK
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.beginPath()
    if (open < 0.08) {
      // one stroke: ∪ smiling, ∩ cross, ~ wobbling, / wry
      ctx.lineWidth = 7 * m
      for (let i = 0; i <= 24; i++) {
        const u = i / 12 - 1
        const y =
          my +
          (-smile * 3 +
            f.frown * 5 +
            (1 - u * u) * (6 * smile - 8 * f.frown) +
            f.wave * 4 * Math.sin(u * Math.PI * 2.5 + f.time * 6 * f.wave) -
            f.crook * (6 * u + 4 * Math.max(0, u) ** 2)) *
            m
        if (i) ctx.lineTo(mx + u * half, y)
        else ctx.moveTo(mx + u * half, y)
      }
      ctx.stroke()
    } else {
      const corner = my - (2 + smile * 3) * m
      const depth = my + (4 + open * 22) * m
      ctx.moveTo(mx - half, corner)
      ctx.quadraticCurveTo(mx, my - (6 - smile * 2) * m, mx + half, corner)
      ctx.quadraticCurveTo(mx + half * 0.6, depth, mx, depth)
      ctx.quadraticCurveTo(mx - half * 0.6, depth, mx - half, corner)
      ctx.fill()
    }
    ctx.restore()
  }

  private marks(ctx: Context2D, f: RigFrame) {
    const { L, R } = this.rig.eyes
    const ew = (L.w + R.w) / 2
    const top = Math.min(L.y, R.y)
    ctx.save()
    ctx.lineCap = ctx.lineJoin = 'round'
    if (f.gloom > 0.02) {
      // shadow lines hanging over the forehead
      ctx.lineWidth = ew * 0.028
      ctx.strokeStyle = GLOOM(0.6 * Math.min(1, f.gloom))
      const from = L.x + ew * 0.28
      const to = R.x + R.w - ew * 0.16
      for (let i = 0; i < 16; i++) {
        const x = from + ((to - from) * i) / 15
        const length = (0.22 + ((i * 37) % 5) * 0.067) * ew * f.gloom
        ctx.beginPath()
        ctx.moveTo(x, top - ew * 0.42)
        ctx.lineTo(x, top - ew * 0.42 + length)
        ctx.stroke()
      }
    }
    if (f.worry > 0.02) {
      // brows lifted where they meet
      for (const [e, outer, inner] of [
        [L, L.x + L.w * 0.24, L.x + L.w * 0.93],
        [R, R.x + R.w * 0.89, R.x + R.w * 0.03],
      ] as const) {
        const outerY = e.y - ew * 0.03
        const innerY = e.y - ew * 0.23 + (1 - f.worry) * ew * 0.17
        this.brow(ctx, outer, outerY, inner, innerY, ew * 0.078 * f.worry)
      }
    }
    if (f.blush > 0.02) {
      const b = Math.min(1, f.blush)
      const y = this.rig.mouth.cy - ew * 0.22
      for (const x of [L.iris[0] - ew * 0.12, R.iris[0] + ew * 0.15]) {
        ctx.fillStyle = BLUSH(0.6 * b)
        ctx.beginPath()
        ctx.ellipse(x, y, ew * 0.29, ew * 0.12, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.85 * b})`
        ctx.lineWidth = ew * 0.032
        for (let i = -1.5; i <= 1.5; i++) {
          ctx.beginPath()
          ctx.moveTo(x + (i * 20 - 7) * (ew / 180), y + ew * 0.065)
          ctx.lineTo(x + (i * 20 + 7) * (ew / 180), y - ew * 0.065)
          ctx.stroke()
        }
      }
    }
    if (f.brow > 0.02) {
      // brows pulled down toward the nose
      for (const [e, outer, inner] of [
        [L, L.x + L.w * 0.17, L.x + L.w * 0.95],
        [R, R.x + R.w * 0.94, R.x + R.w * 0.1],
      ] as const) {
        const outerY = e.y - ew * 0.3 + (1 - f.brow) * ew * 0.19
        this.brow(
          ctx,
          outer,
          outerY,
          inner,
          e.y + ew * 0.01,
          ew * 0.11 * f.brow,
        )
      }
    }
    if (f.sweat > 0.02) {
      // a drop at the temple, sliding down and starting over
      const fall = (f.time * 0.35) % 1
      const s = (ew / 180) * 1.15 * Math.min(1, f.sweat)
      ctx.globalAlpha =
        Math.min(1, f.sweat) * (fall > 0.85 ? (1 - fall) / 0.15 : 1)
      ctx.translate(R.x + R.w + ew * 0.11, R.y - ew * 0.3 + fall * ew * 0.33)
      ctx.scale(s, s)
      ctx.beginPath()
      ctx.moveTo(0, -62)
      ctx.bezierCurveTo(10, -30, 34, -6, 34, 16)
      ctx.arc(0, 16, 34, 0, Math.PI)
      ctx.bezierCurveTo(-34, -6, -10, -30, 0, -62)
      ctx.fillStyle = SWEAT
      ctx.fill()
      ctx.lineWidth = 8
      ctx.strokeStyle = OUTLINE
      ctx.stroke()
    }
    ctx.restore()
  }

  /** An ink brow over a white halo, so it reads over hair. */
  private brow(
    ctx: Context2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
  ) {
    for (const [colour, scale] of [
      ['#fff', 1.8],
      [INK, 1],
    ] as const) {
      ctx.strokeStyle = colour
      ctx.lineWidth = width * scale
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const cache = new Map<string, Promise<HTMLImageElement>>()

/** Decoded once per URL and shared by every face on screen. */
export function loadImage(src: string) {
  let pending = cache.get(src)
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Could not load ${src}`))
      image.src = src
    })
    pending.catch(() => cache.delete(src))
    cache.set(src, pending)
  }
  return pending
}

export async function loadRigImages(assets: {
  base: string
  eyes: Record<'L' | 'R', { white: string; iris: string; lid: string }>
}): Promise<RigImages> {
  const eye = async (layers: { white: string; iris: string; lid: string }) => {
    const [white, iris, lid] = await Promise.all([
      loadImage(layers.white),
      loadImage(layers.iris),
      loadImage(layers.lid),
    ])
    return { white, iris, lid }
  }
  const [base, L, R] = await Promise.all([
    loadImage(assets.base),
    eye(assets.eyes.L),
    eye(assets.eyes.R),
  ])
  return { base, eyes: { L, R } }
}
