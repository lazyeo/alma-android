import { t } from '../i18n/runtime'
import { AlmaHttpError, type AlmaApi } from '../relay/almaApi'

export const FILE_SIZE_LIMIT = 50 * 1024 * 1024
export const TEXT_PREVIEW_LIMIT = 1024 * 1024

export type FileHref =
  | { kind: 'local'; href: string; path: string }
  | { kind: 'unresolved-home'; href: string }
  | { kind: 'external'; href: string }
  | { kind: 'relative'; href: string }
  | { kind: 'unsupported'; href: string }

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function classifyFileHref(href: string, desktopHome?: string): FileHref {
  const decoded = safelyDecode(href.trim())
  if (/^https?:\/\//i.test(decoded)) return { kind: 'external', href: decoded }
  if (/^file:\/\//i.test(decoded)) {
    try {
      const url = new URL(decoded)
      const path = decodeURIComponent(url.pathname).replace(/#L\d+$/, '')
      return path.startsWith('/')
        ? { kind: 'local', href, path }
        : { kind: 'unsupported', href }
    } catch {
      return { kind: 'unsupported', href }
    }
  }
  if (decoded.startsWith('~/')) {
    if (!desktopHome) return { kind: 'unresolved-home', href: decoded }
    return {
      kind: 'local',
      href,
      path: `${desktopHome.replace(/[\\/]$/, '')}/${decoded.slice(2)}`.replace(
        /#L\d+$/,
        '',
      ),
    }
  }
  if (/^[A-Za-z]:[\\/]/.test(decoded))
    return { kind: 'local', href, path: decoded.replace(/#L\d+$/, '') }
  if (decoded.startsWith('/'))
    return { kind: 'local', href, path: decoded.replace(/#L\d+$/, '') }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded))
    return { kind: 'unsupported', href: decoded }
  return { kind: 'relative', href: decoded }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  csv: 'text/csv',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  mdx: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  webp: 'image/webp',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  c: 'text/plain',
  cc: 'text/plain',
  css: 'text/plain',
  go: 'text/plain',
  h: 'text/plain',
  html: 'text/plain',
  java: 'text/plain',
  js: 'text/plain',
  jsx: 'text/plain',
  kt: 'text/plain',
  py: 'text/plain',
  rs: 'text/plain',
  sh: 'text/plain',
  swift: 'text/plain',
  ts: 'text/plain',
  tsx: 'text/plain',
}

export function fallbackMimeType(name: string) {
  const extension =
    name.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

export function validateFileSize(size: number) {
  if (size > FILE_SIZE_LIMIT) throw new Error('FILE_TOO_LARGE')
  return size
}

export interface DesktopFile {
  path: string
  name: string
  mimeType: string
  size: number
  bytes: Uint8Array
}

function responseHeader(headers: Record<string, string>, name: string) {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )
  return entry?.[1]
}

export async function fetchDesktopFile(
  api: Pick<AlmaApi, 'tunnel'>,
  path: string,
): Promise<DesktopFile> {
  const endpoint = `/api/files-abs-binary?path=${encodeURIComponent(path)}`
  const response = await api.tunnel.fetch(endpoint, { method: 'GET' })
  if (response.status < 200 || response.status >= 300)
    throw new AlmaHttpError(
      `GET ${endpoint} failed (${response.status})`,
      response.status,
    )
  const declaredSize = Number(
    responseHeader(response.headers, 'content-length'),
  )
  if (Number.isFinite(declaredSize)) validateFileSize(declaredSize)
  const bytes = await response.bytes()
  validateFileSize(bytes.byteLength)
  const name = fileName(path)
  const contentType = responseHeader(response.headers, 'content-type')
  return {
    path,
    name,
    mimeType: contentType?.split(';', 1)[0].trim() || fallbackMimeType(name),
    size: bytes.byteLength,
    bytes,
  }
}

export function fileErrorPresentation(error: unknown) {
  const status = error instanceof AlmaHttpError ? error.status : undefined
  if (status === 404)
    return {
      title: t('files.link.errors.notFound'),
      detail: t('files.link.errors.notFoundDetail'),
    }
  if (
    (error instanceof Error && error.message === 'FILE_TOO_LARGE') ||
    status === 413
  )
    return {
      title: t('files.link.errors.tooLarge'),
      detail: t('files.link.errors.tooLargeDetail'),
    }
  if (status === 502 || /offline|socket|closed|connect/i.test(String(error)))
    return {
      title: t('files.link.errors.offline'),
      detail: t('files.link.errors.offlineDetail'),
    }
  return {
    title: t('files.link.errors.loadFailed'),
    detail: t('files.link.errors.loadFailedDetail'),
  }
}

export function fileActionErrorText(
  kind: 'open' | 'share' | 'save',
  error: unknown,
) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : undefined
  if (code === 'FILE_TOO_LARGE') return t('files.link.errors.handoffTooLarge')
  if (code === 'UNAVAILABLE') return t('files.link.errors.saveUnsupported')
  if (kind === 'open') return t('files.link.errors.openFailed')
  if (kind === 'share') return t('files.link.errors.shareFailed')
  return t('files.link.errors.saveFailed')
}

export function fileName(path: string) {
  return (
    path.split(/[\\/]/).filter(Boolean).pop() || t('files.link.fallbackName')
  )
}

export function isTextPreview(mime: string, name: string) {
  return (
    mime.startsWith('text/') ||
    ['application/json', 'application/xml'].includes(mime) ||
    /\.(?:c|cc|css|go|h|html|java|js|jsx|json|kt|log|md|markdown|mdx|py|rs|sh|swift|ts|tsx|txt|xml|ya?ml)$/i.test(
      name,
    )
  )
}
