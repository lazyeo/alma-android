// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PartView } from './PartView'
import type { MessagePart } from './index'

const capabilities = { renderMarkdown: (text: string) => <p>{text}</p> }

const renderPart = (part: MessagePart) =>
  render(<PartView part={part} capabilities={capabilities} />)

afterEach(cleanup)

describe('PartView unknown parts', () => {
  it('keeps showing the text of an unknown part', () => {
    const view = renderPart({ type: 'future-note', text: 'still readable' })
    expect(view.getByText('still readable')).toBeTruthy()
    expect(view.container.querySelector('.message-unsupported')).toBeNull()
  })

  it('shows the voice placeholder for audio-looking parts', () => {
    for (const part of [
      { type: 'voice', url: '/api/gallery/cache/a.m4a' },
      { type: 'audio' },
      { type: 'recording', mediaType: 'audio/ogg' },
    ]) {
      const view = renderPart(part)
      expect(view.getByText("Voice message (can't be played)")).toBeTruthy()
      view.unmount()
    }
  })

  it('shows a generic placeholder instead of a blank row', () => {
    const view = renderPart({ type: 'chart', spec: {} })
    expect(
      view.getByText('This content cannot be shown here yet.'),
    ).toBeTruthy()
  })

  it('treats a file part without a usable url as unsupported, not blank', () => {
    const view = renderPart({ type: 'file', url: 42 })
    expect(view.container.querySelector('.message-unsupported')).toBeTruthy()
  })

  it('stays silent for step markers and SDK bookkeeping parts', () => {
    for (const type of ['step-start', 'source-url', 'data-usage']) {
      const view = renderPart({ type })
      expect(view.container.innerHTML).toBe('')
      view.unmount()
    }
  })
})
