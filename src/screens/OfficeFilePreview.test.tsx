// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DocxFilePreview from './DocxFilePreview'
import XlsxFilePreview from './XlsxFilePreview'
import type { DesktopFile } from './localFiles'

const { renderAsync, loadSpreadsheet } = vi.hoisted(() => ({
  renderAsync: vi.fn(),
  loadSpreadsheet: vi.fn(),
}))
vi.mock('docx-preview', () => ({ renderAsync }))
vi.mock('./xlsxPreview', () => ({ loadSpreadsheet }))
const file = {
  name: 'test.docx',
  path: '/test.docx',
  mimeType: '',
  size: 1,
  bytes: new Uint8Array([1]),
} as DesktopFile

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
it('isolates DOCX output and removes active content and navigation', async () => {
  renderAsync.mockImplementation(async (_bytes, body, styles, options) => {
    expect(body.ownerDocument).not.toBe(document)
    expect(options.renderAltChunks).toBe(false)
    expect(options.useBase64URL).toBe(true)
    body.innerHTML =
      '<p onclick="bad()">Document</p><script>bad()</script><iframe src="https://example.com"></iframe><a href="https://example.com">Link</a><img src="https://example.com/a.png"><img src="data:image/png;base64,AA==">'
    styles.innerHTML = '<style>p{color:red}</style>'
  })
  render(<DocxFilePreview file={file} />)
  const frame = await screen.findByTitle('Document preview')
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
  const html = frame.getAttribute('srcdoc')!
  expect(html).toContain("default-src 'none'")
  expect(html).toContain('data:image/png;base64,AA==')
  expect(html).toContain('Document')
  expect(html).not.toMatch(/onclick|<script|<iframe|href=|https:\/\/example/)
})
it('reports a DOCX renderer failure', async () => {
  renderAsync.mockRejectedValue(new Error('invalid zip'))
  render(<DocxFilePreview file={file} />)
  expect(await screen.findByText(/Preview unavailable/)).toBeTruthy()
})
it('switches worksheet data with clicks and keyboard navigation', async () => {
  loadSpreadsheet.mockResolvedValue({
    names: ['One', 'Two'],
    sheet: (name: string) => ({
      rows: [['Heading'], [name + ' value']],
      truncated: false,
    }),
  })
  render(<XlsxFilePreview file={file} />)
  expect(await screen.findByText('One value')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
  expect(screen.getByText('Two value')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Two' }), {
    key: 'ArrowRight',
  })
  expect(screen.getByText('One value')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }))
  expect(screen.getByRole('tabpanel', { name: 'One' })).toBeTruthy()
})

it('shows localized table truncation notices and clips rendered columns', async () => {
  loadSpreadsheet.mockResolvedValue({
    names: ['Wide'],
    sheet: () => ({
      rows: [Array.from({ length: 101 }, (_, i) => `Column ${i}`)],
      truncated: true,
    }),
  })
  render(<XlsxFilePreview file={file} />)
  expect(await screen.findByText('Showing the first 2000 rows.')).toBeTruthy()
  expect(screen.getByText('Showing the first 100 columns.')).toBeTruthy()
  expect(screen.getAllByRole('columnheader')).toHaveLength(100)
  expect(screen.queryByText('Column 100')).toBeNull()
})
