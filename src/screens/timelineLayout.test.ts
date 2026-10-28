import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import {
  layoutTimeline,
  markerAtOffset,
  timelineEntries,
} from './timelineLayout'

const row = (id: string, role: string, text = ''): MessageRow => ({
  id,
  threadId: 't',
  message: { id, role, parts: text ? [{ type: 'text', text }] : [] },
})

describe('timeline entries', () => {
  it('maps root rows to user and assistant entries with previews', () => {
    expect(
      timelineEntries([
        row('u1', 'user', '  Plan the\n release  '),
        row('a1', 'assistant', 'Sure'),
        row('s1', 'system'),
      ]),
    ).toEqual([
      {
        index: 0,
        id: 'u1',
        kind: 'user',
        preview: 'Plan the release',
        contentLength: 16,
      },
      {
        index: 1,
        id: 'a1',
        kind: 'assistant',
        preview: 'Sure',
        contentLength: 4,
      },
    ])
  })

  it('clips long previews', () => {
    const [entry] = timelineEntries([row('u', 'user', 'x'.repeat(200))])
    expect(entry.preview.length).toBeLessThanOrEqual(80)
    expect(entry.preview.endsWith('…')).toBe(true)
  })
})

describe('dense timeline layout', () => {
  const entries = (count: number, every = 2) =>
    Array.from({ length: count }, (_, index) => ({
      index,
      id: String(index),
      kind: index % every === 0 ? ('user' as const) : ('assistant' as const),
      preview: '',
    }))

  it('spreads markers proportionally when they fit', () => {
    const markers = layoutTimeline(entries(3), 3, 200, 8)
    expect(markers.map((marker) => marker.top)).toEqual([0, 100, 200])
  })

  it('centers a single marker', () => {
    expect(layoutTimeline(entries(1), 1, 200, 8)[0].top).toBe(100)
  })

  it('keeps user markers over assistant markers when crowded', () => {
    const markers = layoutTimeline(entries(100), 100, 100, 10)
    expect(markers.length).toBeLessThanOrEqual(11)
    expect(markers.every((marker) => marker.kind === 'user')).toBe(true)
    expect(markers[0].index).toBe(0)
  })

  it('never places two markers closer than the minimum gap', () => {
    const markers = layoutTimeline(entries(500, 3), 500, 300, 6)
    for (let i = 1; i < markers.length; i++)
      expect(markers[i].top - markers[i - 1].top).toBeGreaterThanOrEqual(6)
  })

  it('maps content length logarithmically to varied tick widths', () => {
    const sized = entries(3).map((entry, index) => ({
      ...entry,
      contentLength: [1, 100, 10_000][index],
    }))
    const markers = layoutTimeline(sized, 3, 200, 8)
    expect(markers.map((marker) => marker.width)).toEqual([6, 12, 18])
  })

  it('magnifies and spreads markers near the drag point while compressing distant ticks', () => {
    const markers = layoutTimeline(entries(7), 7, 240, 8, 120)
    const center = markers.find((marker) => marker.index === 3)!
    const near = markers.find((marker) => marker.index === 2)!
    const far = markers[0]
    expect(center.scale).toBeGreaterThan(near.scale)
    expect(near.scale).toBeGreaterThan(far.scale)
    expect(center.top - near.top).toBeGreaterThan(40)
    expect(far.top).toBeGreaterThan(0)
  })

  it('returns no markers for an empty rail or thread', () => {
    expect(layoutTimeline([], 0, 200, 8)).toEqual([])
    expect(layoutTimeline(entries(3), 3, 0, 8)).toEqual([])
  })

  it('finds the nearest marker for a drag offset, clamped to the rail', () => {
    const markers = layoutTimeline(entries(3), 3, 200, 8)
    expect(markerAtOffset(markers, 90)?.index).toBe(1)
    expect(markerAtOffset(markers, -40)?.index).toBe(0)
    expect(markerAtOffset(markers, 999)?.index).toBe(2)
    expect(markerAtOffset([], 10)).toBeUndefined()
  })
})
