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
import PdfFilePreview from './PdfFilePreview'
const mock = vi.hoisted(() => {
  const cancel = vi.fn()
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel }))
  const getPage = vi.fn(async (_number: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render,
  }))
  const destroy = vi.fn()
  const getDocument = vi.fn((_options: { data: Uint8Array }) => ({
    promise: Promise.resolve({ numPages: 100, getPage }),
    destroy,
  }))
  return { getPage, render, cancel, destroy, getDocument }
})
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: mock.getDocument,
  GlobalWorkerOptions: {},
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    measure: () => {},
    measureElement: () => {},
    getTotalSize: () => 80000,
    getVirtualItems: () => [
      { key: 0, index: 0, start: 0, end: 800 },
      { key: 1, index: 1, start: 800, end: 1600 },
    ],
    scrollOffset: 0,
  }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
it('renders only the visible page window, resizes on zoom, and destroys its worker', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const bytes = new Uint8Array([1, 2, 3])
  const { unmount } = render(
    <PdfFilePreview
      file={{
        name: 'a.pdf',
        path: '/a.pdf',
        mimeType: 'application/pdf',
        size: 3,
        bytes,
      }}
    />,
  )
  await waitFor(() => expect(mock.render).toHaveBeenCalledTimes(2))
  expect(mock.getPage.mock.calls.map((call) => call[0])).toEqual([1, 2])
  expect(mock.getDocument.mock.calls[0][0].data).not.toBe(bytes)
  expect(screen.getByText('Page 1 of 100')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  await waitFor(() => expect(mock.render).toHaveBeenCalledTimes(4))
  expect(screen.getByText('125%')).toBeTruthy()
  unmount()
  expect(mock.destroy).toHaveBeenCalledOnce()
  expect(mock.cancel).toHaveBeenCalled()
})
it('reports a corrupt or password-protected document without losing the sheet', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  mock.getDocument.mockImplementationOnce(() => ({
    promise: Promise.reject(new Error('invalid')),
    destroy: mock.destroy,
  }))
  await act(async () => {
    render(
      <PdfFilePreview
        file={{
          name: 'a.pdf',
          path: '/a.pdf',
          mimeType: 'application/pdf',
          size: 1,
          bytes: new Uint8Array([0]),
        }}
      />,
    )
  })
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'Preview unavailable',
    ),
  )
})
