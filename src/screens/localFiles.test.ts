import { describe, expect, it } from 'vitest'
import { AlmaHttpError } from '../relay/almaApi'
import {
  fileActionErrorText,
  FILE_SIZE_LIMIT,
  classifyFileHref,
  fileErrorPresentation,
  fallbackMimeType,
  fetchDesktopFile,
  validateFileSize,
} from './localFiles'

describe('classifyFileHref', () => {
  it.each([
    ['/home/example/Documents/plan.docx', '/home/example/Documents/plan.docx'],
    ['/tmp/render.png', '/tmp/render.png'],
    ['/opt/alma/readme.txt', '/opt/alma/readme.txt'],
    ['%2Fhome%2Fexample%2FMy%2520File.pdf', '/home/example/My%20File.pdf'],
    ['file:///home/example/My%20File.pdf', '/home/example/My File.pdf'],
    ['C:\\Users\\Example\\report.xlsx', 'C:\\Users\\Example\\report.xlsx'],
    ['/home/example/code.ts#L12', '/home/example/code.ts'],
  ])('recognizes %s as a local file', (href, path) => {
    expect(classifyFileHref(href)).toMatchObject({ kind: 'local', path })
  })

  it('resolves a home-relative path only when desktop home is known', () => {
    expect(classifyFileHref('~/notes/today.md', '/home/example')).toMatchObject(
      {
        kind: 'local',
        path: '/home/example/notes/today.md',
      },
    )
    expect(classifyFileHref('~/notes/today.md')).toEqual({
      kind: 'unresolved-home',
      href: '~/notes/today.md',
    })
  })

  it.each(['https://example.com/a', 'http://localhost:3000/a'])(
    'keeps %s external',
    (href) =>
      expect(classifyFileHref(href)).toEqual({ kind: 'external', href }),
  )

  it('makes relative links inert instead of navigating the WebView', () => {
    expect(classifyFileHref('docs/readme.md')).toEqual({
      kind: 'relative',
      href: 'docs/readme.md',
    })
  })
})

describe('file metadata helpers', () => {
  it.each([
    [
      'report.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'sheet.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    [
      'slides.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    ['archive.zip', 'application/zip'],
    ['photo.webp', 'image/webp'],
    ['source.ts', 'text/plain'],
    ['unknown.bin', 'application/octet-stream'],
  ])('maps %s to a fallback MIME type', (name, mime) => {
    expect(fallbackMimeType(name)).toBe(mime)
  })

  it('rejects files above 50 MiB', () => {
    expect(() => validateFileSize(FILE_SIZE_LIMIT + 1)).toThrowError(
      'FILE_TOO_LARGE',
    )
    expect(validateFileSize(FILE_SIZE_LIMIT)).toBe(FILE_SIZE_LIMIT)
  })
})

describe('fetchDesktopFile', () => {
  it('fetches encoded absolute paths through the relay and keeps response metadata', async () => {
    const fetch = async (path: string) => {
      expect(path).toBe(
        '/api/files-abs-binary?path=%2Fhome%2Fexample%2FMy%20File.txt',
      )
      return {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Content-Length': '5' },
        bytes: async () => new TextEncoder().encode('hello'),
        text: async () => 'hello',
        json: async () => ({}),
      }
    }
    const result = await fetchDesktopFile(
      { tunnel: { fetch } } as never,
      '/home/example/My File.txt',
    )
    expect(result).toMatchObject({
      name: 'My File.txt',
      mimeType: 'text/plain',
      size: 5,
    })
    expect(new TextDecoder().decode(result.bytes)).toBe('hello')
  })

  it('rejects oversized content from headers before reading bytes', async () => {
    let read = false
    const fetch = async () => ({
      status: 200,
      headers: { 'content-length': String(FILE_SIZE_LIMIT + 1) },
      bytes: async () => {
        read = true
        return new Uint8Array()
      },
      text: async () => '',
      json: async () => ({}),
    })
    await expect(
      fetchDesktopFile({ tunnel: { fetch } } as never, '/tmp/large.zip'),
    ).rejects.toThrow('FILE_TOO_LARGE')
    expect(read).toBe(false)
  })
})

describe('fileErrorPresentation', () => {
  it('maps missing, oversized, offline and unknown errors to human copy', () => {
    expect(fileErrorPresentation(new AlmaHttpError('missing', 404)).title).toBe(
      'File not found',
    )
    expect(fileErrorPresentation(new Error('FILE_TOO_LARGE')).title).toBe(
      'File is too large',
    )
    expect(fileErrorPresentation(new AlmaHttpError('offline', 502)).title).toBe(
      'Desktop is offline',
    )
    expect(fileErrorPresentation(new Error('socket closed')).title).toBe(
      'Desktop is offline',
    )
    expect(fileErrorPresentation(new Error('unexpected response')).title).toBe(
      'Couldn’t load this file',
    )
  })
})

describe('fileActionErrorText', () => {
  it('maps native handoff codes and falls back per action', () => {
    expect(fileActionErrorText('save', { code: 'FILE_TOO_LARGE' })).toMatch(
      /50 MB/,
    )
    expect(fileActionErrorText('save', { code: 'UNAVAILABLE' })).toMatch(
      /Android 10/,
    )
    expect(fileActionErrorText('open', new Error('boom'))).toMatch(
      /Couldn’t open/,
    )
    expect(fileActionErrorText('share', undefined)).toMatch(/Couldn’t share/)
  })
})
