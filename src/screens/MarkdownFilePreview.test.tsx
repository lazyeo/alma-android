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
import type { DesktopFile } from './localFiles'
import { MARKDOWN_PREVIEW_LIMIT } from './markdownPreview'
import { MarkdownFilePreview } from './MarkdownFilePreview'

const markdown = `# Release notes

<script>window.pwned = true</script>

[Install](./install.md#steps)

![Diagram](images/diagram.png)

| Item | State |
| --- | --- |
| Preview | Ready |
`

const file: DesktopFile = {
  path: '/home/example/docs/readme.md',
  name: 'readme.md',
  mimeType: 'text/markdown',
  size: markdown.length,
  bytes: new TextEncoder().encode(markdown),
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
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:diagram'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('renders safe Markdown by default and switches to source', () => {
  render(
    <MarkdownFilePreview file={file} api={{} as never} onOpenFile={() => {}} />,
  )

  expect(screen.getByRole('heading', { name: 'Release notes' })).toBeTruthy()
  expect(document.querySelector('script')).toBeNull()
  expect(document.querySelector('.markdown-table-wrap')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Source' }))
  expect(document.querySelector('pre.file-link-text')?.textContent).toBe(
    markdown,
  )
})

it('opens relative links in the file sheet with a normalized path and anchor', () => {
  const onOpenFile = vi.fn()
  render(
    <MarkdownFilePreview
      file={file}
      api={{} as never}
      onOpenFile={onOpenFile}
    />,
  )
  fireEvent.click(screen.getByRole('link', { name: 'Install' }))
  expect(onOpenFile).toHaveBeenCalledWith(
    '/home/example/docs/install.md',
    'steps',
  )
})

it('loads local images through the desktop tunnel and revokes their blob URLs', async () => {
  const fetch = vi.fn(async () => ({
    status: 200,
    headers: { 'content-type': 'image/png' },
    bytes: async () => new Uint8Array([1, 2, 3]),
    text: async () => '',
    json: async () => ({}),
  }))
  const view = render(
    <MarkdownFilePreview
      file={file}
      api={{ tunnel: { fetch } } as never}
      onOpenFile={() => {}}
    />,
  )
  await waitFor(() =>
    expect(screen.getByAltText('Diagram').getAttribute('src')).toBe(
      'blob:diagram',
    ),
  )
  expect(fetch).toHaveBeenCalledWith(
    '/api/files-abs-binary?path=%2Fhome%2Fexample%2Fdocs%2Fimages%2Fdiagram.png',
    { method: 'GET' },
  )
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:diagram')
})

it('shows a placeholder when a local image is missing', async () => {
  const fetch = vi.fn(async () => ({
    status: 404,
    headers: {},
    bytes: async () => new Uint8Array(),
    text: async () => '',
    json: async () => ({}),
  }))
  render(
    <MarkdownFilePreview
      file={file}
      api={{ tunnel: { fetch } } as never}
      onOpenFile={() => {}}
    />,
  )
  expect(await screen.findByText('Diagram unavailable')).toBeTruthy()
})

it('defaults large Markdown files to source with a preview limit note', () => {
  const large = { ...file, size: MARKDOWN_PREVIEW_LIMIT + 1 }
  render(
    <MarkdownFilePreview
      file={large}
      api={{} as never}
      onOpenFile={() => {}}
    />,
  )
  expect(
    screen.getByRole('tab', { name: 'Source' }).getAttribute('aria-selected'),
  ).toBe('true')
  expect(
    screen.getByText(/Preview is available for Markdown files up to 1 MB/),
  ).toBeTruthy()
})

it('opens and closes the rendered preview full screen', async () => {
  vi.useFakeTimers()
  try {
    render(
      <MarkdownFilePreview
        file={file}
        api={{} as never}
        onOpenFile={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    const dialog = screen.getByRole('dialog', { name: 'readme.md' })
    expect(dialog.querySelector('.markdown-file-content')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog.className).toContain('closing')
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(screen.queryByRole('dialog', { name: 'readme.md' })).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
