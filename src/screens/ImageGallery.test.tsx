// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
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
vi.mock('../components/ImageAnnotator', () => ({
  ImageAnnotator: ({
    onDone,
  }: {
    onDone(blob: Blob, regions: [], note: string): void
  }) => (
    <div role="dialog" aria-label="Annotate image">
      <button
        onClick={() =>
          onDone(new Blob(['marked'], { type: 'image/png' }), [], '')
        }
      >
        Done
      </button>
    </div>
  ),
}))

function Harness({ source = '/two' }: { source?: string }) {
  const gallery = useImageGallery()
  return <button onClick={() => gallery.openGallery(source)}>Open image</button>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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

  fireEvent.click(screen.getByRole('button', { name: 'Open image' }))
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

it('shows annotate only when the host supplies the capability', async () => {
  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => `blob:${blob.size}`,
    revokeObjectURL: vi.fn(),
  })
  const onAnnotate = vi.fn()
  const view = render(
    <ImageGalleryProvider
      images={[{ source: '/one', name: 'One' }]}
      onAnnotate={onAnnotate}
    >
      <Harness source="/one" />
    </ImageGalleryProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Annotate' }))
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: 'Annotate image' })).toBeTruthy(),
  )
  expect(onAnnotate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(onAnnotate).toHaveBeenCalledTimes(1))
  expect(
    screen.getByRole('dialog', { name: 'Image gallery' }).className,
  ).toContain('closing')
  view.unmount()

  render(
    <ImageGalleryProvider images={[{ source: '/one', name: 'One' }]}>
      <Harness source="/one" />
    </ImageGalleryProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open image' }))
  expect(screen.queryByRole('button', { name: 'Annotate' })).toBeNull()
})
