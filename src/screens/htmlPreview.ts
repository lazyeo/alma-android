/**
 * Pure rules for previewing desktop HTML files. Tier 1 (web, PWA and any
 * fallback) renders the document alone in an opaque-origin srcdoc frame.
 * Tier 2 (Android) serves the document and its sibling files from a
 * per-session origin that the WebView intercepts; see HtmlPreviewServer.java,
 * which mirrors the path and MIME rules below.
 */

/** Opaque origin: no app storage, no top navigation, no popups. */
export const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals'

/**
 * The native host is a separate origin that serves only this session's files,
 * so it may keep its own origin (relative fetches, storage) without reaching
 * the app.
 */
export const NATIVE_PREVIEW_SANDBOX =
  'allow-scripts allow-forms allow-same-origin'

const ESCAPE_TOKENS = [
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
]

/** Throws before a preview frame could render with an escape hatch. */
export function assertPreviewSandbox(
  sandbox: string,
  { isolatedHost = false }: { isolatedHost?: boolean } = {},
) {
  const tokens = sandbox.split(/\s+/).filter(Boolean)
  const refused = tokens.filter(
    (token) =>
      ESCAPE_TOKENS.includes(token) ||
      (token === 'allow-same-origin' && !isolatedHost),
  )
  if (refused.length)
    throw new Error(`Unsafe HTML preview sandbox: ${refused.join(' ')}`)
}

/** Inline-only: the document cannot load, post or beacon anything. */
export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' data: blob:",
  "style-src 'unsafe-inline' data: blob:",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ')

const LEADING_DOCTYPE = /^﻿?(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i

/**
 * The CSP meta must precede every script, so it goes straight after the
 * doctype (keeping standards mode) or first when there is none; the parser
 * moves it into the implicit head either way.
 */
export function buildPreviewSrcDoc(html: string) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">`
  const doctype = LEADING_DOCTYPE.exec(html)?.[0] ?? ''
  return `${doctype}${meta}${html.slice(doctype.length)}`
}

export function isHtmlFile(name: string) {
  return /\.html?$/i.test(name.split(/[?#]/, 1)[0])
}

export interface HtmlPreviewFile {
  path: string
  name: string
  relativePath: string
}

export function parseHtmlFileList(
  value: unknown,
  workspacePath: string,
): HtmlPreviewFile[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { htmlFiles?: unknown }).htmlFiles)
  )
    throw new Error('Unreadable HTML file list')
  const separator = isWindowsPath(workspacePath) ? '\\' : '/'
  return (value as { htmlFiles: unknown[] }).htmlFiles.flatMap((entry) => {
    if (typeof entry !== 'string' || !isHtmlFile(entry)) return []
    const normalized = normalizePreviewPath(`/${entry}`)
    if (!normalized.ok || !normalized.path) return []
    const name = normalized.path.split('/').at(-1) ?? normalized.path
    return [
      {
        path: `${workspacePath.replace(/[\\/]$/, '')}${separator}${normalized.path
          .split('/')
          .join(separator)}`,
        name,
        relativePath: normalized.path,
      },
    ]
  })
}

export const NATIVE_PREVIEW_ORIGIN_SUFFIX = 'alma-preview.localhost'

/** Tokens come from the native plugin (SecureRandom, 128 bits). */
export function nativePreviewOrigin(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error('Invalid preview token')
  return `https://${NATIVE_PREVIEW_ORIGIN_SUFFIX}/${token}`
}

export type PreviewPath =
  { ok: true; path: string } | { ok: false; status: 403 }

const FORBIDDEN = { ok: false, status: 403 } as const
// Control characters, backslashes (Windows separators), drive/stream colons,
// and any percent left after one decode (double encoding) never name a
// sibling file.
const UNSAFE_DECODED = /[\u0000-\u001f\u007f\\:%]/

/**
 * Maps a request path on the preview origin to a path relative to the entry
 * document's folder. Anything that could leave that folder is a 403.
 */
export function normalizePreviewPath(rawPath: string): PreviewPath {
  if (rawPath === '' || rawPath === '/') return { ok: true, path: '' }
  if (!rawPath.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(rawPath))
    return FORBIDDEN
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return FORBIDDEN
  }
  if (UNSAFE_DECODED.test(decoded)) return FORBIDDEN
  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return FORBIDDEN
    segments.push(segment)
  }
  return { ok: true, path: segments.join('/') }
}

const isWindowsPath = (path: string) => /^[A-Za-z]:[\\/]/.test(path)

export function previewRootDirectory(entryPath: string) {
  const index = Math.max(
    entryPath.lastIndexOf('/'),
    entryPath.lastIndexOf('\\'),
  )
  return index <= 0 ? entryPath.slice(0, index + 1) : entryPath.slice(0, index)
}

export function previewFilePath(
  root: string,
  entryName: string,
  relativePath: string,
) {
  const separator = isWindowsPath(root) ? '\\' : '/'
  const relative = (relativePath || entryName).split('/').join(separator)
  return `${root.replace(/[\\/]$/, '')}${separator}${relative}`
}

const PREVIEW_MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  md: 'text/markdown',
  mjs: 'text/javascript',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  otf: 'font/otf',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  txt: 'text/plain',
  wasm: 'application/wasm',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml',
}

/**
 * Extension wins over the desktop's Content-Type: the desktop labels source
 * files text/plain, which a nosniff response would refuse to run as script.
 */
export function previewMimeType(name: string, declared?: string) {
  const extension = /\.([^./]+)$/.exec(name)?.[1].toLowerCase() ?? ''
  const known = PREVIEW_MIME_BY_EXTENSION[extension]
  if (known) return known
  const type = declared?.split(';', 1)[0].trim().toLowerCase()
  return type && /^[a-z]+\/[a-z0-9.+-]+$/.test(type)
    ? type
    : 'application/octet-stream'
}
