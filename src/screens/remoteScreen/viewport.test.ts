import { describe, expect, it } from 'vitest'
import {
  clampView,
  desktopToSurface,
  edgeMargin,
  fitRect,
  IDENTITY_VIEW,
  keepPointVisible,
  MAX_ZOOM,
  oneToOneScale,
  panView,
  pinchView,
  settleView,
  surfaceDeltaToDesktop,
  surfaceToDesktop,
  viewTransform,
  zoomAround,
  zoomPercent,
  type View,
} from './viewport'

// A phone surface showing a 16:10 Mac: letterboxed top and bottom.
const phone = { width: 400, height: 600 }
const mac = { width: 1440, height: 900 }
// 400 wide × 250 tall, centred: top = 175.
const fit = { left: 0, top: 175, width: 400, height: 250 }

const close = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 9)

describe('fitRect', () => {
  it('letterboxes a wide desktop in a tall surface', () => {
    expect(fitRect(phone, mac)).toEqual(fit)
  })

  it('pillarboxes a tall window in a wide surface', () => {
    expect(
      fitRect({ width: 800, height: 400 }, { width: 500, height: 1000 }),
    ).toEqual({ left: 300, top: 0, width: 200, height: 400 })
  })

  it('falls back to the whole surface before the content size is known', () => {
    expect(fitRect(phone, { width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 400,
      height: 600,
    })
  })
})

describe('surfaceToDesktop and desktopToSurface', () => {
  const views: View[] = [
    IDENTITY_VIEW,
    { scale: 2, x: -150, y: -300 },
    { scale: 4, x: -1200, y: -1500 },
    { scale: 1.37, x: -61.3, y: -222.9 },
  ]

  it('round-trips desktop points through every view', () => {
    for (const view of views)
      for (const point of [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0.25, y: 0.8 },
        { x: 0.5, y: 0.5 },
      ]) {
        const surface = desktopToSurface(point, phone, mac, view)
        const back = surfaceToDesktop(surface, phone, mac, view)
        close(back.x, point.x)
        close(back.y, point.y)
        expect(back.inside).toBe(true)
      }
  })

  it('maps the content corners and centre at fit', () => {
    expect(
      surfaceToDesktop({ x: 0, y: 175 }, phone, mac, IDENTITY_VIEW),
    ).toEqual({ x: 0, y: 0, inside: true })
    expect(
      surfaceToDesktop({ x: 400, y: 425 }, phone, mac, IDENTITY_VIEW),
    ).toEqual({ x: 1, y: 1, inside: true })
    expect(
      surfaceToDesktop({ x: 200, y: 300 }, phone, mac, IDENTITY_VIEW),
    ).toEqual({ x: 0.5, y: 0.5, inside: true })
  })

  it('reports letterboxing as outside and clamps to the nearest edge', () => {
    expect(
      surfaceToDesktop({ x: 100, y: 20 }, phone, mac, IDENTITY_VIEW),
    ).toEqual({ x: 0.25, y: 0, inside: false })
    expect(
      surfaceToDesktop({ x: 100, y: 590 }, phone, mac, IDENTITY_VIEW),
    ).toEqual({ x: 0.25, y: 1, inside: false })
  })

  it('applies the inverse of the zoom and pan', () => {
    // At 2× panned so the desktop centre sits at the surface centre.
    const view = { scale: 2, x: -200, y: -300 }
    const centre = surfaceToDesktop({ x: 200, y: 300 }, phone, mac, view)
    close(centre.x, 0.5)
    close(centre.y, 0.5)
    // 100 surface px right is 50 layer px, an eighth of the 400px fit width.
    const right = surfaceToDesktop({ x: 300, y: 300 }, phone, mac, view)
    close(right.x, 0.625)
  })

  it('is independent of the desktop capture resolution', () => {
    const retina = { width: 2880, height: 1800 }
    const view = { scale: 2.5, x: -310, y: -480 }
    const point = { x: 123, y: 321 }
    expect(surfaceToDesktop(point, phone, retina, view)).toEqual(
      surfaceToDesktop(point, phone, mac, view),
    )
  })

  it('gives the same desktop point in CSS px at any phone DPR', () => {
    // A 3× phone reports the same CSS px; scaling every length by the DPR
    // (device px) must not change the answer either.
    const dpr = 3
    const view = { scale: 2, x: -150, y: -300 }
    const point = { x: 210, y: 280 }
    const css = surfaceToDesktop(point, phone, mac, view)
    const device = surfaceToDesktop(
      { x: point.x * dpr, y: point.y * dpr },
      { width: phone.width * dpr, height: phone.height * dpr },
      mac,
      { scale: view.scale, x: view.x * dpr, y: view.y * dpr },
    )
    close(device.x, css.x)
    close(device.y, css.y)
  })
})

describe('surfaceDeltaToDesktop', () => {
  it('divides finger movement by the zoom', () => {
    const atFit = surfaceDeltaToDesktop(
      { x: 40, y: 25 },
      phone,
      mac,
      IDENTITY_VIEW,
    )
    close(atFit.x, 0.1)
    close(atFit.y, 0.1)
    const zoomed = surfaceDeltaToDesktop({ x: 40, y: 25 }, phone, mac, {
      scale: 4,
      x: 0,
      y: 0,
    })
    close(zoomed.x, 0.025)
    close(zoomed.y, 0.025)
  })
})

describe('clampView', () => {
  it('keeps zoom within 1 to 4', () => {
    expect(clampView({ scale: 0.5, x: 10, y: 10 }, phone, mac)).toEqual(
      IDENTITY_VIEW,
    )
    expect(clampView({ scale: 9, x: 0, y: 0 }, phone, mac).scale).toBe(MAX_ZOOM)
  })

  it('never pans past the content edges', () => {
    // At 2× the content is 800 × 500 starting at layer y 175 → surface 350.
    const view = clampView({ scale: 2, x: 500, y: 500 }, phone, mac)
    expect(view.x).toBe(0)
    // Content (500 tall) is shorter than the 600 surface: centred.
    expect(view.y).toBe((600 - 500) / 2 - 175 * 2)
    const far = clampView({ scale: 2, x: -5000, y: 0 }, phone, mac)
    expect(far.x).toBe(400 - 800)
  })

  it('clamps vertically once the zoomed content is taller than the view', () => {
    // At 4× the content is 1000 tall from layer 175 → range [-1100, -700].
    expect(clampView({ scale: 4, x: 0, y: 0 }, phone, mac).y).toBe(-700)
    expect(clampView({ scale: 4, x: 0, y: -9000 }, phone, mac).y).toBe(-1100)
  })
})

describe('zoomAround and pinchView', () => {
  it('keeps the anchored desktop point under the anchor', () => {
    // At 3× the content is taller than the view, so neither axis is centred.
    const anchor = { x: 120, y: 300 }
    const before = surfaceToDesktop(anchor, phone, mac, IDENTITY_VIEW)
    const view = zoomAround(IDENTITY_VIEW, anchor, 3, phone, mac)
    const after = surfaceToDesktop(anchor, phone, mac, view)
    close(after.x, before.x)
    close(after.y, before.y)
  })

  it('zooms at the fingers centroid and follows it when it moves', () => {
    const start = { x: 150, y: 300 }
    const target = surfaceToDesktop(start, phone, mac, IDENTITY_VIEW)
    // Fingers spread from 100 to 300 px apart (3×) and the centroid moves.
    const moved = { x: 200, y: 320 }
    const view = pinchView(IDENTITY_VIEW, start, 100, moved, 300, phone, mac)
    expect(view.scale).toBe(3)
    const under = surfaceToDesktop(moved, phone, mac, view)
    close(under.x, target.x)
    close(under.y, target.y)
  })

  it('caps the pinch at 4× and at fit', () => {
    expect(
      pinchView(
        IDENTITY_VIEW,
        { x: 0, y: 0 },
        10,
        { x: 0, y: 0 },
        1000,
        phone,
        mac,
      ).scale,
    ).toBe(4)
    expect(
      pinchView(
        { scale: 2, x: -200, y: -300 },
        { x: 200, y: 300 },
        200,
        { x: 200, y: 300 },
        10,
        phone,
        mac,
      ),
    ).toEqual(IDENTITY_VIEW)
  })

  it('ignores a zero starting distance', () => {
    expect(
      pinchView(
        IDENTITY_VIEW,
        { x: 5, y: 5 },
        0,
        { x: 5, y: 5 },
        50,
        phone,
        mac,
      ),
    ).toEqual(IDENTITY_VIEW)
  })
})

describe('settleView', () => {
  it('snaps below 1.03 back to fit', () => {
    expect(settleView({ scale: 1.029, x: -3, y: -4 }, phone, mac)).toEqual(
      IDENTITY_VIEW,
    )
    expect(settleView({ scale: 1.5, x: -100, y: -350 }, phone, mac).scale).toBe(
      1.5,
    )
  })
})

describe('panView and keepPointVisible', () => {
  const zoomed = { scale: 2, x: -200, y: -300 }

  it('pans within the content', () => {
    expect(panView(zoomed, { x: 50, y: 0 }, phone, mac).x).toBe(-150)
    expect(panView(zoomed, { x: 999, y: 0 }, phone, mac).x).toBe(0)
  })

  it('does nothing at fit', () => {
    expect(keepPointVisible(IDENTITY_VIEW, { x: 1, y: 1 }, phone, mac)).toBe(
      IDENTITY_VIEW,
    )
  })

  it('leaves a point inside the margins alone', () => {
    expect(keepPointVisible(zoomed, { x: 200, y: 300 }, phone, mac)).toBe(
      zoomed,
    )
  })

  it('pans a point near the edge back to the margin', () => {
    expect(edgeMargin(400)).toBe(56)
    expect(edgeMargin(100)).toBe(25)
    const view = keepPointVisible(zoomed, { x: 380, y: 300 }, phone, mac)
    expect(view.x).toBe(-200 - (380 - (400 - 56)))
    const left = keepPointVisible(zoomed, { x: 10, y: 300 }, phone, mac)
    expect(left.x).toBe(-200 + 46)
  })

  it('stops at the content edge', () => {
    const view = keepPointVisible(
      { scale: 2, x: -400, y: -300 },
      { x: 399, y: 300 },
      phone,
      mac,
    )
    expect(view.x).toBe(-400)
  })
})

describe('oneToOneScale', () => {
  it('maps one stream pixel to one device pixel', () => {
    // 1440 px across 400 CSS px at DPR 2 (800 device px) is 1.8×.
    expect(oneToOneScale(phone, mac, 2)).toBeCloseTo(1.8)
    expect(oneToOneScale(phone, { width: 2880, height: 1800 }, 3)).toBeCloseTo(
      2.4,
    )
  })

  it('never goes below fit or above 4×', () => {
    expect(oneToOneScale(phone, { width: 320, height: 200 }, 3)).toBe(1)
    expect(oneToOneScale(phone, { width: 5120, height: 3200 }, 1)).toBe(4)
  })
})

describe('labels and CSS', () => {
  it('formats the zoom and the transform', () => {
    expect(zoomPercent(2.456)).toBe(246)
    expect(viewTransform({ scale: 2, x: -10, y: 4.5 })).toBe(
      'translate3d(-10px, 4.5px, 0) scale(2)',
    )
  })
})
