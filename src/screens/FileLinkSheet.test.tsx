// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FileLinkProvider, useFileLinks } from './FileLinkSheet'

const files: Record<string, { body: string; type: string }> = {
  '/home/example/site/index.html': {
    body: '<h1>Site</h1>',
    type: 'text/plain',
  },
  '/home/example/notes.md': { body: '# Notes', type: 'text/markdown' },
  '/home/example/notes.txt': { body: 'plain notes', type: 'text/plain' },
}

vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({
    api: {
      tunnel: {
        fetch: async (endpoint: string) => {
          const path =
            new URLSearchParams(endpoint.split('?')[1]).get('path') ?? ''
          const file = files[path]
          return {
            status: file ? 200 : 404,
            headers: file ? { 'content-type': file.type } : {},
            bytes: async () => new TextEncoder().encode(file?.body ?? ''),
          }
        },
      },
    },
  }),
}))

function Opener({ path }: { path: string }) {
  const { openFile } = useFileLinks()
  return <button onClick={() => openFile(path)}>Open</button>
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
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:file',
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('previews .html files with Preview and Source segments', async () => {
  render(
    <FileLinkProvider>
      <Opener path="/home/example/site/index.html" />
    </FileLinkProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  const preview = await screen.findByRole('tab', { name: 'Preview' })
  expect(preview.getAttribute('aria-selected')).toBe('true')
  expect(screen.getByRole('tab', { name: 'Source' })).toBeTruthy()
  expect(
    document
      .querySelector('iframe.html-preview-frame')
      ?.getAttribute('sandbox'),
  ).toBe('allow-scripts allow-forms allow-modals')
})

it('keeps the plain text preview for other files', async () => {
  render(
    <FileLinkProvider>
      <Opener path="/home/example/notes.txt" />
    </FileLinkProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByText('plain notes')
  expect(screen.queryByRole('tab', { name: 'Preview' })).toBeNull()
})

it('renders markdown files with Preview and Source segments', async () => {
  render(
    <FileLinkProvider>
      <Opener path="/home/example/notes.md" />
    </FileLinkProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(await screen.findByRole('tab', { name: 'Preview' })).toBeTruthy()
  expect(await screen.findByRole('heading', { name: 'Notes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Source' }))
  expect(await screen.findByText('# Notes')).toBeTruthy()
})

it.each([
  ['sound.mp3', 'audio'],
  ['clip.mp4', 'video'],
  ['drawing.svg', 'img'],
])('renders %s safely with retained actions', async (name, tag) => {
  const path = `/home/example/${name}`
  files[path] = {
    body: '<svg onload="alert(1)"/>',
    type: 'application/octet-stream',
  }
  render(
    <FileLinkProvider>
      <Opener path={path} />
    </FileLinkProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('button', { name: /Open with/ })
  const element = document.querySelector(`${tag}[src="blob:file"]`)
  expect(element).toBeTruthy()
  if (tag !== 'img') expect(element?.hasAttribute('controls')).toBe(true)
  if (tag === 'video') expect(element?.hasAttribute('playsinline')).toBe(true)
  expect(document.querySelector('svg[onload]')).toBeNull()
})
