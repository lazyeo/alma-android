import { describe, expect, it, vi } from 'vitest'
import type { AnnotationRegion } from '../components/imageAnnotatorModel'
import { stageImageEditResult } from './imageEditStaging'

const region: AnnotationRegion = {
  id: 'region-1',
  index: 1,
  tool: 'rect',
  color: '#ef4444',
  label: 'Move this button',
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.4, y: 0.5 },
  ],
}

describe('gallery image edit staging', () => {
  it('creates a pending image attachment and composer request without sending', () => {
    const uploadImage = vi.fn()
    const generateResponse = vi.fn()
    const blob = new Blob(['flattened'], { type: 'image/png' })

    const result = stageImageEditResult({
      image: { source: '/tmp/original.jpeg', name: 'Original.jpeg' },
      blob,
      regions: [region],
      note: 'Keep the spacing compact.',
      copy: {
        visibleHeader: 'Edit requests',
        overallLabel: 'Overall: ',
        directive: 'Follow the numbered badges on the attached image.',
        sourcePathLabel: 'Source: ',
      },
      createId: () => 'attachment-1',
      createObjectUrl: () => 'blob:flattened',
    })

    expect(result.attachment).toEqual({
      id: 'attachment-1',
      kind: 'image',
      name: 'Original.png',
      mediaType: 'image/png',
      previewUrl: 'blob:flattened',
      pending: { blob },
    })
    expect(result.text).toContain('**Edit requests**\n\n① Move this button')
    expect(result.text).toContain('Source: /tmp/original.jpeg')
    expect(uploadImage).not.toHaveBeenCalled()
    expect(generateResponse).not.toHaveBeenCalled()
  })

  it('leaves the composer text empty when nothing is labelled', () => {
    const result = stageImageEditResult({
      image: { source: 'http://localhost/cache/a.png', name: 'a.png' },
      blob: new Blob(['flattened'], { type: 'image/png' }),
      regions: [{ ...region, label: '' }],
      note: '  ',
      copy: {
        visibleHeader: 'Edit requests',
        overallLabel: 'Overall: ',
        directive: 'Follow the numbered badges on the attached image.',
        sourcePathLabel: 'Source: ',
      },
      createId: () => 'attachment-2',
      createObjectUrl: () => 'blob:flattened',
    })
    expect(result.text).toBe('')
    expect(result.attachment.kind).toBe('image')
  })
})
