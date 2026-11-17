// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PartView } from './PartView'
import type { MessagePart } from './index'

const renderImage = vi.fn((source: string) => <img src={source} alt="" />)
const capabilities = {
  renderMarkdown: (text: string) => <p>{text}</p>,
  renderImage,
}

const renderPart = (part: MessagePart) =>
  render(<PartView part={part} capabilities={capabilities} />)

afterEach(() => {
  cleanup()
  renderImage.mockClear()
})

describe('PartView file parts', () => {
  it('shows a sent file as a card with its type icon and extension', () => {
    const view = renderPart({
      type: 'file',
      url: 'http://localhost:23001/api/files/plate.3mf',
      mediaType: 'application/octet-stream',
      filename: 'plate.3mf',
    })

    const card = view.container.querySelector('.message-file')
    expect(card).toBeTruthy()
    expect(card?.querySelector('svg.lucide-box')).toBeTruthy()
    expect(view.getByText('plate.3mf')).toBeTruthy()
    expect(view.getByText('3MF')).toBeTruthy()
    expect(view.container.querySelector('img')).toBeNull()
    expect(renderImage).not.toHaveBeenCalled()
  })

  it('prefers a known size over the extension', () => {
    const view = renderPart({
      type: 'file',
      url: 'http://localhost:23001/api/files/report.pdf',
      mediaType: 'application/pdf',
      filename: 'report.pdf',
      size: 1536,
    })

    expect(
      view.container.querySelector('.message-file svg.lucide-file-text'),
    ).toBeTruthy()
    expect(view.getByText('1.5 KB')).toBeTruthy()
    expect(view.queryByText('PDF')).toBeNull()
  })

  it('names an unnamed file part with the generic attachment label', () => {
    const view = renderPart({
      type: 'file',
      url: 'http://localhost:23001/api/files/blob',
    })

    expect(view.getByText('Attachment')).toBeTruthy()
    expect(
      view.container.querySelector('.message-file svg.lucide-file'),
    ).toBeTruthy()
  })

  it('still hands image file parts to the image renderer', () => {
    renderPart({
      type: 'file',
      url: 'http://localhost:23001/api/gallery/cache/photo.png',
      mediaType: 'image/png',
      filename: 'photo.png',
    })

    expect(renderImage).toHaveBeenCalledWith(
      'http://localhost:23001/api/gallery/cache/photo.png',
      'photo.png',
    )
  })
})
