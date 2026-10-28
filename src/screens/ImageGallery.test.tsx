// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ImageGalleryProvider, useImageGallery } from './ImageGallery'

vi.mock('./relayImages', () => ({
  imageCache: () => ({
    get: async (source: string) => new Blob([source], { type: 'image/png' }),
  }),
}))
vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api: {} }),
}))

function Harness() {
  const gallery = useImageGallery()
  return (
    <button onClick={() => gallery.openGallery('/two')}>Open second</button>
  )
}

afterEach(() => cleanup())

it('opens at the tapped image, arrows and thumbnails change index, and X closes', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => `blob:${blob.size}`,
    revokeObjectURL: vi.fn(),
  })
  render(
    <ImageGalleryProvider
      images={[
        { source: '/one', name: 'One' },
        { source: '/two', name: 'Two' },
        { source: '/three', name: 'Three' },
      ]}
    >
      <Harness />
    </ImageGalleryProvider>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Open second' }))
  expect(screen.getByText('2 / 3')).toBeTruthy()

  const stage = document.querySelector('.gallery-stage')! as HTMLElement & {
    setPointerCapture(pointerId: number): void
  }
  stage.setPointerCapture = vi.fn()
  fireEvent.pointerDown(stage, { pointerId: 1, clientX: 260, clientY: 300 })
  fireEvent.pointerMove(stage, { pointerId: 1, clientX: 150, clientY: 300 })
  fireEvent.pointerUp(stage, { pointerId: 1, clientX: 150, clientY: 300 })
  expect(screen.getByText('3 / 3')).toBeTruthy()

  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(screen.getByText('2 / 3')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'View One' }))
  expect(screen.getByText('1 / 3')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Close gallery' }))
  act(() => vi.advanceTimersByTime(320))
  expect(screen.queryByRole('dialog', { name: 'Image gallery' })).toBeNull()
  vi.useRealTimers()
})
