import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HTML_PREVIEW_CSP,
  HTML_PREVIEW_SANDBOX,
  NATIVE_PREVIEW_ORIGIN_SUFFIX,
  NATIVE_PREVIEW_SANDBOX,
  assertPreviewSandbox,
  buildPreviewSrcDoc,
  isHtmlFile,
  nativePreviewOrigin,
  normalizePreviewPath,
  parseHtmlFileList,
  previewFilePath,
  previewMimeType,
  previewRootDirectory,
} from './htmlPreview'

describe('isHtmlFile', () => {
  it.each([
    'index.html',
    'REPORT.HTM',
    'a.b.html',
    '/home/example/site/page.htm',
  ])('detects %s', (name) => expect(isHtmlFile(name)).toBe(true))

  it.each(['index.html.md', 'notes.txt', 'html', 'page.xhtml', 'shot.png'])(
    'ignores %s',
    (name) => expect(isHtmlFile(name)).toBe(false),
  )
})

describe('tier 1 sandbox and CSP', () => {
  it('runs scripts, forms and dialogs but never shares the app origin', () => {
    expect(HTML_PREVIEW_SANDBOX).toBe('allow-scripts allow-forms allow-modals')
    expect(() => assertPreviewSandbox(HTML_PREVIEW_SANDBOX)).not.toThrow()
  })

  it.each([
    'allow-scripts allow-same-origin',
    'allow-scripts allow-top-navigation',
    'allow-scripts allow-top-navigation-by-user-activation',
    'allow-popups',
    'allow-scripts allow-popups-to-escape-sandbox',
  ])('refuses the escape token in %s', (sandbox) => {
    expect(() => assertPreviewSandbox(sandbox)).toThrow(/sandbox/i)
  })

  it('allows same-origin only for the isolated native preview host', () => {
    expect(NATIVE_PREVIEW_SANDBOX).toBe(
      'allow-scripts allow-forms allow-same-origin',
    )
    expect(() =>
      assertPreviewSandbox(NATIVE_PREVIEW_SANDBOX, { isolatedHost: true }),
    ).not.toThrow()
    expect(() =>
      assertPreviewSandbox('allow-scripts allow-same-origin allow-popups', {
        isolatedHost: true,
      }),
    ).toThrow(/sandbox/i)
  })

  it('blocks every network fetch, form post, base rewrite and plugin', () => {
    for (const directive of [
      "default-src 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-src 'none'",
    ])
      expect(HTML_PREVIEW_CSP).toContain(directive)
    expect(HTML_PREVIEW_CSP).not.toMatch(/https?:|\*/)
  })

  it('injects the CSP before any document content, after the doctype', () => {
    const html =
      '<!DOCTYPE html>\n<script>alert(1)</script><html><head><title>x</title></head></html>'
    const doc = buildPreviewSrcDoc(html)
    const meta = `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">`
    expect(doc.startsWith(`<!DOCTYPE html>${meta}`)).toBe(true)
    expect(doc.indexOf(meta)).toBeLessThan(doc.indexOf('<script>'))
    expect(doc.endsWith(html.slice('<!DOCTYPE html>'.length))).toBe(true)
  })

  it('injects at the very start when there is no doctype', () => {
    const doc = buildPreviewSrcDoc('<!-- note --><p>Hi</p>')
    expect(doc).toMatch(/^<meta http-equiv="Content-Security-Policy"/)
  })

  it('does not treat a doctype inside a comment as the document doctype', () => {
    const doc = buildPreviewSrcDoc('<p>x</p><!DOCTYPE html>')
    expect(doc).toMatch(/^<meta /)
  })
})

describe('normalizePreviewPath', () => {
  it.each([
    ['/', ''],
    ['', ''],
    ['/index.html', 'index.html'],
    ['/css/site.css', 'css/site.css'],
    ['/./css//site.css', 'css/site.css'],
    ['/img/My%20Photo.png', 'img/My Photo.png'],
    ['/caf%C3%A9.html', 'café.html'],
  ])('maps %s to %s', (raw, path) => {
    expect(normalizePreviewPath(raw)).toEqual({ ok: true, path })
  })

  it.each([
    '/../secret.txt',
    '/a/../../b',
    '/a/..',
    '/%2e%2e/secret',
    '/%2E%2E%2Fsecret',
    '/a%2f..%2f..%2fb',
    '/a\\..\\b',
    '/a%5c..%5cb',
    '/a%00.html',
    '/C:/Windows/win.ini',
    '/%252e%252e/secret',
    '/bad%zz',
    'relative.html',
    '/a\nb',
  ])('refuses %s with 403', (raw) => {
    expect(normalizePreviewPath(raw)).toEqual({ ok: false, status: 403 })
  })
})

describe('preview file mapping', () => {
  it('serves files beside the entry document', () => {
    expect(previewRootDirectory('/home/example/site/index.html')).toBe(
      '/home/example/site',
    )
    expect(previewRootDirectory('C:\\site\\index.html')).toBe('C:\\site')
    expect(previewFilePath('/home/example/site', 'index.html', '')).toBe(
      '/home/example/site/index.html',
    )
    expect(
      previewFilePath('/home/example/site', 'index.html', 'css/a.css'),
    ).toBe('/home/example/site/css/a.css')
    expect(previewFilePath('C:\\site', 'index.html', 'css/a.css')).toBe(
      'C:\\site\\css\\a.css',
    )
  })
})

describe('native preview origin', () => {
  it('derives a separate per-session origin from a random token', () => {
    const token = `${'01234567'}${'89abcdef'}${'fedcba98'}${'76543210'}`
    expect(NATIVE_PREVIEW_ORIGIN_SUFFIX).toBe('alma-preview.localhost')
    expect(nativePreviewOrigin(token)).toBe(
      `https://alma-preview.localhost/${token}`,
    )
    expect(() => nativePreviewOrigin('../evil')).toThrow()
  })
})

describe('previewMimeType', () => {
  it.each([
    ['index.html', undefined, 'text/html'],
    ['page.HTM', 'text/plain', 'text/html'],
    ['app.js', 'text/plain', 'text/javascript'],
    ['app.mjs', undefined, 'text/javascript'],
    ['site.css', 'text/plain', 'text/css'],
    ['data.json', undefined, 'application/json'],
    ['logo.svg', undefined, 'image/svg+xml'],
    ['font.woff2', undefined, 'font/woff2'],
    ['module.wasm', undefined, 'application/wasm'],
    ['clip.mp4', undefined, 'video/mp4'],
    ['blob.custom', 'image/x-custom; charset=binary', 'image/x-custom'],
    ['blob.unknown', undefined, 'application/octet-stream'],
    ['blob.unknown', 'not a mime', 'application/octet-stream'],
  ])('%s with %s serves %s', (name, declared, expected) => {
    expect(previewMimeType(name, declared)).toBe(expected)
  })
})

describe('HTML preview styles', () => {
  it('styles the fullscreen preview with the shared overlay motion', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(
      /\.html-preview-fullscreen \{[^}]*animation: fullscreen-overlay-in var\(--dur-fast\) var\(--ease-out\) both;/s,
    )
    expect(css).toMatch(
      /\.html-preview-fullscreen\.closing \{[^}]*animation: fullscreen-overlay-out var\(--dur-fast\) var\(--ease-out\) both;/s,
    )
    expect(css).toMatch(
      /\.html-preview-fullscreen \{[^}]*padding: var\(--safe-top\) var\(--safe-right\) var\(--safe-bottom\) var\(--safe-left\);/s,
    )
    expect(css).toMatch(/\.html-preview-expand \{[^}]*min-width: 40px;/s)
  })
})

describe('parseHtmlFileList', () => {
  it('joins the desktop relative-file response to the workspace path', () => {
    expect(
      parseHtmlFileList(
        {
          htmlFiles: [
            'site/index.html',
            'docs/Guide.HTM',
            'readme.md',
            '../escape.html',
          ],
        },
        '/w',
      ),
    ).toEqual([
      {
        path: '/w/site/index.html',
        name: 'index.html',
        relativePath: 'site/index.html',
      },
      {
        path: '/w/docs/Guide.HTM',
        name: 'Guide.HTM',
        relativePath: 'docs/Guide.HTM',
      },
    ])
  })

  it('supports Windows workspace paths', () => {
    expect(parseHtmlFileList({ htmlFiles: ['site/a.html'] }, 'C:\\w')).toEqual([
      {
        path: 'C:\\w\\site\\a.html',
        name: 'a.html',
        relativePath: 'site/a.html',
      },
    ])
  })

  it('treats any other shape as an unreadable response', () => {
    expect(() => parseHtmlFileList({ error: 'x' }, '/w')).toThrow()
    expect(() => parseHtmlFileList('nope', '/w')).toThrow()
  })
})
