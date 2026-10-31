export const ANNOTATION_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#84cc16',
  '#06b6d4',
  '#d946ef',
  '#ffffff',
] as const

export type AnnotationTool = 'rect' | 'ellipse' | 'brush' | 'arrow'
export type AnnotatorTool = 'select' | AnnotationTool

export interface Point {
  x: number
  y: number
}

export interface AnnotationRegion {
  id: string
  index: number
  tool: AnnotationTool
  color: string
  label?: string
  points: Point[]
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ImageEditRequest {
  regions: Array<{ index: number; color: string; label?: string }>
  note?: string
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function normalizePoint(point: Point, width: number, height: number) {
  return {
    x: clamp01(width ? point.x / width : 0),
    y: clamp01(height ? point.y / height : 0),
  }
}

export function boundingBox(region: AnnotationRegion): Bounds {
  const xs = region.points.map((point) => point.x)
  const ys = region.points.map((point) => point.y)
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  }
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y)
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  )
  return Math.hypot(
    point.x - (start.x + progress * dx),
    point.y - (start.y + progress * dy),
  )
}

export function hitTestRegion(
  region: AnnotationRegion,
  point: Point,
  tolerance: number,
) {
  if (region.tool === 'rect' || region.tool === 'ellipse') {
    const box = boundingBox(region)
    if (region.tool === 'rect')
      return (
        point.x >= box.left - tolerance &&
        point.x <= box.right + tolerance &&
        point.y >= box.top - tolerance &&
        point.y <= box.bottom + tolerance
      )
    const rx = Math.max((box.right - box.left) / 2, tolerance)
    const ry = Math.max((box.bottom - box.top) / 2, tolerance)
    const cx = box.left + rx
    const cy = box.top + ry
    return (
      ((point.x - cx) * (point.x - cx)) / (rx + tolerance) ** 2 +
        ((point.y - cy) * (point.y - cy)) / (ry + tolerance) ** 2 <=
      1
    )
  }
  return region.points.some((current, index) => {
    const next = region.points[index + 1]
    return next ? distanceToSegment(point, current, next) <= tolerance : false
  })
}

export function translateRegion(region: AnnotationRegion, delta: Point) {
  const box = boundingBox(region)
  const dx = Math.max(-box.left, Math.min(1 - box.right, delta.x))
  const dy = Math.max(-box.top, Math.min(1 - box.bottom, delta.y))
  return {
    ...region,
    points: region.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    })),
  }
}

export function arrowHead(start: Point, end: Point, length: number) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const spread = Math.PI / 6
  return {
    tip: end,
    left: {
      x: end.x - length * Math.cos(angle - spread),
      y: end.y - length * Math.sin(angle - spread),
    },
    right: {
      x: end.x - length * Math.cos(angle + spread),
      y: end.y - length * Math.sin(angle + spread),
    },
  }
}

export function regionAnchor(region: AnnotationRegion) {
  if (region.tool === 'rect' || region.tool === 'ellipse') {
    const box = boundingBox(region)
    return { x: box.left, y: box.top }
  }
  return region.points[0] ?? { x: 0, y: 0 }
}

/** Badge ink: dark text on light annotation colors, white otherwise. */
export function isLightColor(hex: string) {
  const value = hex.replace('#', '')
  if (value.length < 6) return false
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 160
}

export function displayNumber(index: number) {
  if (index >= 1 && index <= 20) return String.fromCodePoint(0x245f + index)
  return String(index)
}

export function buildMarkupNotes(regions: readonly AnnotationRegion[]) {
  return regions
    .flatMap((region) => {
      const label = region.label?.trim()
      return label ? [`${displayNumber(region.index)} ${label}`] : []
    })
    .join('\n')
}

export function drawRegion(
  context: CanvasRenderingContext2D,
  region: AnnotationRegion,
  width: number,
  height: number,
  selected = false,
) {
  if (!region.points.length) return
  const points = region.points.map((point) => ({
    x: point.x * width,
    y: point.y * height,
  }))
  const strokeWidth = Math.max(2, Math.round(Math.min(width, height) * 0.006))
  const badgeRadius = Math.max(10, Math.round(Math.min(width, height) * 0.022))
  context.save()
  context.strokeStyle = region.color
  context.fillStyle = region.color
  context.lineWidth = strokeWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  if (region.tool === 'rect' || region.tool === 'ellipse') {
    const start = points[0]
    const end = points.at(-1) ?? start
    const left = Math.min(start.x, end.x)
    const top = Math.min(start.y, end.y)
    const regionWidth = Math.abs(end.x - start.x)
    const regionHeight = Math.abs(end.y - start.y)
    if (region.tool === 'rect')
      context.rect(left, top, regionWidth, regionHeight)
    else
      context.ellipse(
        left + regionWidth / 2,
        top + regionHeight / 2,
        regionWidth / 2,
        regionHeight / 2,
        0,
        0,
        Math.PI * 2,
      )
    context.stroke()
  } else {
    context.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
    if (region.tool === 'arrow' && points.length > 1) {
      const head = arrowHead(
        points.at(-2) ?? points[0],
        points.at(-1) ?? points[0],
        Math.max(strokeWidth * 4, badgeRadius),
      )
      context.beginPath()
      context.moveTo(head.left.x, head.left.y)
      context.lineTo(head.tip.x, head.tip.y)
      context.lineTo(head.right.x, head.right.y)
      context.stroke()
    }
  }
  if (selected) {
    const box = boundingBox(region)
    context.strokeStyle = '#ffffff'
    context.setLineDash([strokeWidth * 2, strokeWidth * 2])
    context.lineWidth = Math.max(1, strokeWidth / 2)
    context.strokeRect(
      box.left * width - strokeWidth * 2,
      box.top * height - strokeWidth * 2,
      (box.right - box.left) * width + strokeWidth * 4,
      (box.bottom - box.top) * height + strokeWidth * 4,
    )
  }
  const anchor = regionAnchor(region)
  // Keep the whole badge inside the image on every edge.
  const badgeX = Math.min(
    width - badgeRadius,
    Math.max(badgeRadius, anchor.x * width),
  )
  const badgeY = Math.min(
    height - badgeRadius,
    Math.max(badgeRadius, anchor.y * height),
  )
  context.setLineDash([])
  context.beginPath()
  context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2)
  context.fillStyle = region.color
  context.fill()
  context.strokeStyle = region.color === '#ffffff' ? '#111111' : '#ffffff'
  context.lineWidth = Math.max(1, strokeWidth / 2)
  context.stroke()
  context.fillStyle = region.color === '#ffffff' ? '#111111' : '#ffffff'
  context.font = `600 ${Math.round(badgeRadius * 1.15)}px system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(String(region.index), badgeX, badgeY + 0.5)
  context.restore()
}

export function buildAlmaImageEdit(
  regions: readonly AnnotationRegion[],
  note?: string,
) {
  const payload: {
    r: Array<{ i: number; c: string; l?: string }>
    n?: string
  } = {
    r: regions.map((region) => ({
      i: region.index,
      c: region.color,
      ...(region.label?.trim() ? { l: region.label.trim() } : {}),
    })),
  }
  if (note?.trim()) payload.n = note.trim()
  return `alma-image-edit:${JSON.stringify(payload)}`
}

export function buildImageEditDraft({
  regions,
  note,
  visibleHeader,
  overallLabel,
  directive,
  sourcePathLabel,
  sourcePath,
}: {
  regions: readonly AnnotationRegion[]
  note?: string
  visibleHeader: string
  overallLabel: string
  directive: string
  sourcePathLabel: string
  sourcePath?: string
}) {
  const rows = regions.map(
    (region) =>
      `${displayNumber(region.index)}${region.label?.trim() ? ` ${region.label.trim()}` : ''}`,
  )
  const visible = [
    `**${visibleHeader}**`,
    rows.join('  \n'),
    note?.trim() ? `${overallLabel}${note.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const reminder = [
    '<system-reminder>',
    buildAlmaImageEdit(regions, note),
    directive,
    sourcePath ? `${sourcePathLabel}${sourcePath}` : '',
    '</system-reminder>',
  ]
    .filter(Boolean)
    .join('\n')
  return `${visible}\n\n${reminder}`
}

const REMINDER_PATTERN =
  /(?:\n\n)?<system-reminder>\s*\nalma-image-edit:([^\n]+)[\s\S]*?<\/system-reminder>/

export function parseAlmaImageEdit(text: string): {
  visibleText: string
  request?: ImageEditRequest
} {
  const match = REMINDER_PATTERN.exec(text)
  if (!match) return { visibleText: text }
  const visibleText = text.replace(match[0], '').trim()
  try {
    const payload = JSON.parse(match[1]) as {
      r?: Array<{ i?: unknown; c?: unknown; l?: unknown }>
      n?: unknown
    }
    if (!Array.isArray(payload.r)) return { visibleText }
    const regions = payload.r.flatMap((region) =>
      typeof region.i === 'number' && typeof region.c === 'string'
        ? [
            {
              index: region.i,
              color: region.c,
              ...(typeof region.l === 'string' && region.l
                ? { label: region.l }
                : {}),
            },
          ]
        : [],
    )
    if (!regions.length) return { visibleText }
    return {
      visibleText,
      request: {
        regions,
        ...(typeof payload.n === 'string' && payload.n
          ? { note: payload.n }
          : {}),
      },
    }
  } catch {
    return { visibleText }
  }
}
