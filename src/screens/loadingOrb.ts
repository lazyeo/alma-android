export interface OrbDot {
  x: number
  y: number
  z: number
  r: number
  white: number
  a?: number
}

export const hash = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return s - Math.floor(s)
}

export const camera = (yaw: number, pitch: number, cx: number, cy: number) => {
  const sp = Math.sin(pitch),
    cp = Math.cos(pitch),
    sy = Math.sin(yaw),
    cyw = Math.cos(yaw)
  return (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cyw + z * sy,
      z1 = -x * sy + z * cyw,
      y2 = y * cp - z1 * sp,
      z2 = y * sp + z1 * cp
    return [cx + x1, cy - y2, z2]
  }
}

const options = {
  orbitN: 3,
  ghostN: 10,
  particles: 3,
  ghostR: 2.16,
  ghostA: 0.5,
  partR: 2.88,
  partRDepth: 3.84,
  rsPow: 0.6,
}

export function orbitDots(n: number, t: number): OrbDot[] {
  const c = n / 2,
    R = (n / 2) * 0.82,
    cam = camera(t * 0.12, 0.3, c, c),
    k = (n / 300) ** options.rsPow,
    dots: OrbDot[] = []
  for (let h = 0; h < options.orbitN; h++) {
    const r1 = hash(h, 1.7),
      r2 = hash(h, 5.2),
      r3 = hash(h, 8.9),
      rad = R * (0.45 + 0.52 * r1),
      phi = r1 * 2 * Math.PI,
      th = Math.acos(2 * r2 - 1),
      nx = Math.sin(th) * Math.cos(phi),
      ny = Math.cos(th),
      nz = Math.sin(th) * Math.sin(phi)
    let ux = -ny,
      uy = nx
    const uz = 0,
      L = Math.max(1e-6, Math.hypot(ux, uy))
    ux /= L
    uy /= L
    const vx = ny * uz - nz * uy,
      vy = nz * ux - nx * uz,
      vz = nx * uy - ny * ux,
      w = (0.25 + 0.55 * r3) * (r3 > 0.5 ? 1 : -1)
    const point = (a: number) =>
      cam(
        (ux * Math.cos(a) + vx * Math.sin(a)) * rad,
        (uy * Math.cos(a) + vy * Math.sin(a)) * rad,
        (uz * Math.cos(a) + vz * Math.sin(a)) * rad,
      )
    for (let i = 0; i < options.ghostN; i++) {
      const [x, y, z] = point((i / options.ghostN) * 2 * Math.PI),
        depth = (z / rad + 1) / 2
      dots.push({
        x,
        y,
        z,
        r: options.ghostR * k,
        white: 0.72,
        a: options.ghostA * (0.4 + 0.6 * depth),
      })
    }
    for (let i = 0; i < options.particles; i++) {
      const [x, y, z] = point(
          t * w + (i / options.particles) * 2 * Math.PI + r2 * 6,
        ),
        depth = (z / rad + 1) / 2
      dots.push({
        x,
        y,
        z,
        r: (options.partR + options.partRDepth * depth) * k,
        white: 0.3 - 0.22 * depth,
      })
    }
  }
  return dots
}

export function paintOrb(
  ctx: CanvasRenderingContext2D,
  n: number,
  t: number,
  dark: boolean,
) {
  const dots = orbitDots(n, t).sort((a, b) => a.z - b.z)
  ctx.clearRect(0, 0, n, n)
  for (const dot of dots) {
    const alpha = dot.a ?? 1
    if (alpha < 0.02) continue
    const white = Math.min(1, Math.max(0, dot.white))
    const value = Math.round((dark ? 1 - white : white) * 255)
    ctx.fillStyle = `rgba(${value},${value},${value},${alpha})`
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, Math.max(0.3, dot.r), 0, Math.PI * 2)
    ctx.fill()
  }
}
