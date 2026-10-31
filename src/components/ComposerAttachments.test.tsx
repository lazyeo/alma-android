// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlmaApi } from '../relay/almaApi'
import type { ComposerAttachment } from '../screens/attachmentUpload'
import type { AnnotationRegion } from './imageAnnotatorModel'
import { ComposerAttachmentTray } from './ComposerAttachments'

vi.mock('./ImageAnnotator', () => ({
  ImageAnnotator: ({
    source,
    onDone,
    onCancel,
  }: {
    source: Blob | string
    onDone(blob: Blob, regions: AnnotationRegion[], note: string): void
    onCancel(): void
  }) => (
    <div role="dialog" aria-label="Annotate image">
      <span data-testid="annotator-source">
        {source instanceof Blob ? source.type : source}
      </span>
      <input aria-label="Region label" defaultValue="label" />
      <button
        onClick={() =>
          onDone(
            new Blob(['annotated'], { type: 'image/png' }),
            [
              {
                id: 'region-1',
                index: 1,
                tool: 'rect',
                color: '#ef4444',
                label: screen.getByRole<HTMLInputElement>('textbox', {
                  name: 'Region label',
                }).value,
                points: [
                  { x: 0.1, y: 0.1 },
                  { x: 0.3, y: 0.3 },
                ],
              },
            ],
            '',
          )
        }
      >
        Done
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

const api = {} as AlmaApi

function pendingImage(): ComposerAttachment {
  return {
    id: 'attachment-1',
    kind: 'image',
    name: 'photo.jpg',
    mediaType: 'image/jpeg',
    previewUrl: 'blob:original',
    pending: {
      blob: new Blob(['original'], { type: 'image/jpeg' }),
      storeKey: 'desktop:thread:attachment-1',
    },
  }
}

describe('ComposerAttachmentTray image markup', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:annotated'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens the annotator with a pending image blob', () => {
    const attachment = pendingImage()

    render(
      <ComposerAttachmentTray
        api={api}
        attachments={[attachment]}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annotate photo.jpg' }))

    expect(screen.getByRole('dialog', { name: 'Annotate image' })).toBeTruthy()
    expect(screen.getByTestId('annotator-source').textContent).toBe(
      'image/jpeg',
    )
  })

  it('replaces the pending blob and preview at the same index on Done', async () => {
    const attachment = pendingImage()
    const other: ComposerAttachment = {
      id: 'attachment-2',
      kind: 'file',
      name: 'notes.txt',
      mediaType: 'text/plain',
      previewUrl: 'blob:notes',
      pending: { blob: new Blob(['notes'], { type: 'text/plain' }) },
    }
    const onChange = vi.fn()

    render(
      <ComposerAttachmentTray
        api={api}
        attachments={[attachment, other]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annotate photo.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ComposerAttachment[]
    expect(next[1]).toBe(other)
    expect(next[0]).toMatchObject({
      id: 'attachment-1',
      kind: 'image',
      name: 'photo.png',
      mediaType: 'image/png',
      previewUrl: 'blob:annotated',
      pending: { storeKey: 'desktop:thread:attachment-1' },
    })
    expect('pending' in next[0]).toBe(true)
    if (!('pending' in next[0])) throw new Error('expected pending attachment')
    expect(await next[0].pending.blob.text()).toBe('annotated')
    expect(URL.createObjectURL).toHaveBeenCalledWith(next[0].pending.blob)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original')
  })

  it('reports labeled markup notes on Done', () => {
    const attachment = pendingImage()
    const onAnnotationText = vi.fn()

    render(
      <ComposerAttachmentTray
        api={api}
        attachments={[attachment]}
        onChange={vi.fn()}
        onAnnotationText={onAnnotationText}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annotate photo.jpg' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Region label' }), {
      target: { value: 'label' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onAnnotationText).toHaveBeenCalledWith('① label')
  })

  it('keeps the attachment unchanged on Cancel', () => {
    const attachment = pendingImage()
    const onChange = vi.fn()

    render(
      <ComposerAttachmentTray
        api={api}
        attachments={[attachment]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annotate photo.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})
