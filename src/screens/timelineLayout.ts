import type { MessageRow } from '../relay'
import { messageText } from './messageParts'

export type TimelineKind = 'user' | 'assistant'
export interface TimelineEntry {
  /** Index into the virtualized root rows. */
  index: number
  id: string
  kind: TimelineKind
  preview: string
  contentLength?: number
}
export interface TimelineMarker extends TimelineEntry {
  top: number
  width: number
  scale: number
}

const PREVIEW_CHARS = 80
const MIN_TICK_WIDTH = 6
const MAX_TICK_WIDTH = 18

export function timelineEntries(roots: MessageRow[]): TimelineEntry[] {
  return roots.flatMap((row, index) => {
    const role = row.message.role
    if (role !== 'user' && role !== 'assistant') return []
    const text = messageText(row.message.parts).replace(/\s+/g, ' ').trim()
    const preview =
      text.length > PREVIEW_CHARS
        ? `${text.slice(0, PREVIEW_CHARS - 1)}…`
        : text
    return [
      {
        index,
        id: row.id,
        kind: role,
        preview,
        contentLength: text.length,
      },
    ]
  })
}

export function timelineTickWidth(contentLength = 0) {
  const normalized = Math.min(1, Math.log10(Math.max(1, contentLength)) / 4)
  return Math.round(
    MIN_TICK_WIDTH + normalized * (MAX_TICK_WIDTH - MIN_TICK_WIDTH),
  )
}

/**
 * Pure timeline geometry. Markers occupy the supplied compact rail height.
 * During a drag, a Gaussian fisheye expands spacing and scale near the finger
 * while compressing distant markers toward the rail center.
 */
export function layoutTimeline(
  entries: TimelineEntry[],
  rowCount: number,
  height: number,
  minGap: number,
  focus?: number,
): TimelineMarker[] {
  if (!entries.length || height <= 0) return []
  const topOf = (index: number) =>
    rowCount <= 1 ? height / 2 : (index / (rowCount - 1)) * height
  const proportional = entries.map((entry) => ({
    ...entry,
    top: topOf(entry.index),
    width: timelineTickWidth(entry.contentLength),
    scale: 1,
  }))
  let markers = proportional
  if (
    !proportional.every(
      (marker, i) => i === 0 || marker.top - proportional[i - 1].top >= minGap,
    )
  ) {
    const chosen = new Map<number, TimelineEntry>()
    for (const entry of entries) {
      const slot = Math.min(
        Math.floor(height / minGap),
        Math.round(topOf(entry.index) / minGap),
      )
      const current = chosen.get(slot)
      if (!current || (current.kind === 'assistant' && entry.kind === 'user'))
        chosen.set(slot, entry)
    }
    markers = [...chosen.entries()]
      .sort(([a], [b]) => a - b)
      .map(([slot, entry]) => ({
        ...entry,
        top: slot * minGap,
        width: timelineTickWidth(entry.contentLength),
        scale: 1,
      }))
  }
  if (focus === undefined) return markers
  const radius = Math.max(44, height * 0.26)
  return markers.map((marker) => {
    const distance = marker.top - focus
    const influence = Math.exp(-Math.pow(distance / radius, 2))
    const direction = Math.sign(distance)
    return {
      ...marker,
      top: Math.max(
        4,
        Math.min(
          height - 4,
          height / 2 +
            (marker.top - height / 2) * 0.78 +
            direction * influence * 18,
        ),
      ),
      scale: 0.78 + influence * 0.92,
    }
  })
}

export function markerAtOffset(
  markers: TimelineMarker[],
  offset: number,
): TimelineMarker | undefined {
  let best: TimelineMarker | undefined
  for (const marker of markers) {
    if (!best || Math.abs(marker.top - offset) < Math.abs(best.top - offset))
      best = marker
  }
  return best
}
