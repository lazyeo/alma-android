import { describe, expect, it } from 'vitest'
import {
  arrowHead,
  buildAlmaImageEdit,
  buildImageEditDraft,
  boundingBox,
  hitTestRegion,
  normalizePoint,
  parseAlmaImageEdit,
  translateRegion,
  type AnnotationRegion,
} from './imageAnnotatorModel'

const rect: AnnotationRegion = {
  id: 'r1',
  index: 1,
  tool: 'rect',
  color: '#ef4444',
  label: 'Move this button',
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.4, y: 0.6 },
  ],
}

describe('image annotator geometry', () => {
  it('normalizes and clamps points to the image bounds', () => {
    expect(normalizePoint({ x: 250, y: -10 }, 200, 100)).toEqual({
      x: 1,
      y: 0,
    })
  })

  it('computes a brush bounding box', () => {
    expect(
      boundingBox({
        ...rect,
        tool: 'brush',
        points: [
          { x: 0.4, y: 0.7 },
          { x: 0.2, y: 0.3 },
          { x: 0.8, y: 0.5 },
        ],
      }),
    ).toEqual({ left: 0.2, top: 0.3, right: 0.8, bottom: 0.7 })
  })

  it('hit tests filled shapes, strokes, arrows, and brushes', () => {
    expect(hitTestRegion(rect, { x: 0.2, y: 0.3 }, 0.02)).toBe(true)
    expect(hitTestRegion(rect, { x: 0.8, y: 0.8 }, 0.02)).toBe(false)
    expect(
      hitTestRegion(
        { ...rect, tool: 'arrow', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { x: 0.52, y: 0.5 },
        0.04,
      ),
    ).toBe(true)
    expect(
      hitTestRegion(
        {
          ...rect,
          tool: 'brush',
          points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
        },
        { x: 0.4, y: 0.53 },
        0.04,
      ),
    ).toBe(true)
  })

  it('translates a region without moving it outside the image', () => {
    const moved = translateRegion(rect, { x: 0.8, y: 0.8 }).points
    expect(moved[0].x).toBeCloseTo(0.7)
    expect(moved[0].y).toBeCloseTo(0.6)
    expect(moved[1]).toEqual({ x: 1, y: 1 })
  })

  it('builds a stable arrow head', () => {
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)
    expect(head.tip).toEqual({ x: 100, y: 0 })
    expect(head.left.x).toBeCloseTo(82.68, 1)
    expect(head.left.y).toBeCloseTo(10, 1)
    expect(head.right.y).toBeCloseTo(-10, 1)
  })
})

describe('image edit request text', () => {
  it('builds visible markdown and the machine-readable reminder', () => {
    const text = buildImageEditDraft({
      regions: [rect, { ...rect, id: 'r2', index: 2, label: '' }],
      note: 'Keep the spacing compact.',
      visibleHeader: 'Edit requests',
      overallLabel: 'Overall: ',
      directive:
        'The numbered badges on the attached image correspond to these requests.',
      sourcePathLabel: 'Source: ',
      sourcePath: '/tmp/source.png',
    })
    expect(text).toContain('**Edit requests**\n\n① Move this button  \n②')
    expect(text).toContain('Overall: Keep the spacing compact.')
    expect(text).toContain(
      'alma-image-edit:{"r":[{"i":1,"c":"#ef4444","l":"Move this button"},{"i":2,"c":"#ef4444"}],"n":"Keep the spacing compact."}',
    )
    expect(text).toContain('Source: /tmp/source.png')
  })

  it('round trips the reminder and strips it from visible text', () => {
    const reminder = buildAlmaImageEdit([rect], 'Use the current type scale.')
    const parsed = parseAlmaImageEdit(
      `**Edit requests**\n\n① Move this button\n\n<system-reminder>\n${reminder}\nDo the work.\n</system-reminder>`,
    )
    expect(parsed).toEqual({
      visibleText: '**Edit requests**\n\n① Move this button',
      request: {
        regions: [{ index: 1, color: '#ef4444', label: 'Move this button' }],
        note: 'Use the current type scale.',
      },
    })
  })

  it('leaves ordinary messages unchanged and rejects malformed payloads', () => {
    expect(parseAlmaImageEdit('Hello')).toEqual({ visibleText: 'Hello' })
    expect(
      parseAlmaImageEdit(
        '<system-reminder>\nalma-image-edit:{bad}\n</system-reminder>',
      ),
    ).toEqual({ visibleText: '' })
  })
})
