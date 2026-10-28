import { describe, expect, it } from 'vitest'
import {
  classifyMarkdownImageSource,
  isMarkdownFile,
  resolveMarkdownPath,
} from './markdownPreview'

describe('isMarkdownFile', () => {
  it.each([
    ['README.md', 'text/plain'],
    ['guide.markdown', 'application/octet-stream'],
    ['component.mdx', 'text/plain'],
    ['notes.txt', 'text/markdown'],
  ])('recognizes %s with %s', (name, mimeType) => {
    expect(isMarkdownFile(name, mimeType)).toBe(true)
  })

  it('does not treat ordinary text as Markdown', () => {
    expect(isMarkdownFile('notes.txt', 'text/plain')).toBe(false)
  })
})

describe('resolveMarkdownPath', () => {
  it.each([
    ['./other.md', '/home/example/notes/other.md'],
    ['../x.docx', '/home/example/x.docx'],
    ['images/../assets/a.png', '/home/example/notes/assets/a.png'],
    ['/tmp/readme.md', '/tmp/readme.md'],
  ])('resolves %s against the document directory', (href, expected) => {
    expect(resolveMarkdownPath('/home/example/notes/readme.md', href)).toEqual({
      path: expected,
    })
  })

  it('keeps anchors separate and decodes local path characters', () => {
    expect(
      resolveMarkdownPath(
        '/home/example/notes/readme.md',
        './My%20File.md#details',
      ),
    ).toEqual({ path: '/home/example/notes/My File.md', anchor: 'details' })
  })

  it('normalizes Windows paths without escaping above their root', () => {
    expect(
      resolveMarkdownPath(
        'C:\\Users\\Example\\notes\\readme.md',
        '..\\..\\x.docx',
      ),
    ).toEqual({ path: 'C:\\Users\\x.docx' })
  })

  it('returns only an anchor for same-document links', () => {
    expect(resolveMarkdownPath('/tmp/readme.md', '#install')).toEqual({
      anchor: 'install',
    })
  })
})

describe('classifyMarkdownImageSource', () => {
  it('maps relative and absolute local images to desktop paths', () => {
    expect(
      classifyMarkdownImageSource(
        '/home/example/docs/readme.md',
        'images/a.png',
      ),
    ).toEqual({ kind: 'local', path: '/home/example/docs/images/a.png' })
    expect(
      classifyMarkdownImageSource('/home/example/docs/readme.md', '/tmp/a.png'),
    ).toEqual({ kind: 'local', path: '/tmp/a.png' })
  })

  it('keeps remote images remote and rejects unsupported schemes', () => {
    expect(
      classifyMarkdownImageSource(
        '/tmp/readme.md',
        'https://example.com/a.png',
      ),
    ).toEqual({ kind: 'remote', src: 'https://example.com/a.png' })
    expect(
      classifyMarkdownImageSource('/tmp/readme.md', 'javascript:alert(1)'),
    ).toEqual({ kind: 'unsupported' })
  })
})
