// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HtmlFilePreview } from './HtmlFilePreview'
import { HTML_PREVIEW_CSP, NATIVE_PREVIEW_SANDBOX } from './htmlPreview'
import type { DesktopFile } from './localFiles'

const html = '<!doctype html><h1>Release</h1><script>1</script>'
const file: DesktopFile = {
  path: '/home/example/site/index.html',
  name: 'index.html',
  mimeType: 'text/html',
  size: html.length,
  bytes: new TextEncoder().encode(html),
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const frame = () =>
  document.querySelector<HTMLIFrameElement>('iframe.html-preview-frame')!

it('defaults to an opaque-origin sandboxed preview with the CSP injected', () => {
  render(<HtmlFilePreview file={file} api={{} as never} />)

  expect(
    screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected'),
  ).toBe('true')
  expect(frame().getAttribute('sandbox')).toBe(
    'allow-scripts allow-forms allow-modals',
  )
  expect(frame().getAttribute('sandbox')).not.toContain('allow-same-origin')
  expect(frame().getAttribute('srcdoc')).toContain(HTML_PREVIEW_CSP)
  expect(frame().getAttribute('src')).toBeNull()
  expect(screen.getByText(/Relative assets need the Android app/)).toBeTruthy()
})

it('switches to the source text', () => {
  render(<HtmlFilePreview file={file} api={{} as never} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Source' }))
  expect(document.querySelector('pre.file-link-text')?.textContent).toBe(html)
  expect(frame()).toBeNull()
})

it('opens and closes a fullscreen preview', async () => {
  vi.useFakeTimers()
  try {
    render(<HtmlFilePreview file={file} api={{} as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    const dialog = screen.getByRole('dialog', { name: 'index.html' })
    expect(
      dialog
        .querySelector('iframe.html-preview-frame')
        ?.getAttribute('sandbox'),
    ).toBe('allow-scripts allow-forms allow-modals')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog.className).toContain('closing')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.queryByRole('dialog', { name: 'index.html' })).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('keeps Escape inside the fullscreen preview', () => {
  const outer = vi.fn()
  window.addEventListener('keydown', outer)
  render(<HtmlFilePreview file={file} api={{} as never} />)
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  window.removeEventListener('keydown', outer)
  expect(outer).not.toHaveBeenCalled()
})

it('serves the native isolated origin and revokes it on unmount', async () => {
  const close = vi.fn(async () => undefined)
  const sessions = {
    open: vi.fn(async () => ({
      url: `https://alma-preview.localhost/${'a'.repeat(32)}/index.html`,
      close,
    })),
  }
  const view = render(
    <HtmlFilePreview file={file} api={{} as never} sessions={sessions} />,
  )
  await waitFor(() =>
    expect(frame().getAttribute('src')).toContain('alma-preview.localhost/'),
  )
  expect(sessions.open).toHaveBeenCalledWith({}, file.path)
  expect(frame().getAttribute('sandbox')).toBe(NATIVE_PREVIEW_SANDBOX)
  expect(frame().getAttribute('srcdoc')).toBeNull()
  expect(screen.queryByText(/Relative assets need the Android app/)).toBeNull()
  view.unmount()
  expect(close).toHaveBeenCalledTimes(1)
})

it('falls back to the srcdoc preview when the native host is unavailable', async () => {
  const sessions = {
    open: vi.fn(async () => {
      throw Object.assign(new Error('nope'), { code: 'UNIMPLEMENTED' })
    }),
  }
  render(<HtmlFilePreview file={file} api={{} as never} sessions={sessions} />)
  await waitFor(() =>
    expect(frame().getAttribute('srcdoc')).toContain(HTML_PREVIEW_CSP),
  )
  expect(frame().getAttribute('sandbox')).not.toContain('allow-same-origin')
})
