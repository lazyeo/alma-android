export const MARKDOWN_PREVIEW_LIMIT = 1024 * 1024

export function isMarkdownFile(name: string, mimeType: string) {
  return (
    mimeType.toLowerCase() === 'text/markdown' ||
    /\.(?:md|markdown|mdx)$/i.test(name.split(/[?#]/, 1)[0])
  )
}

function decodePath(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function splitHref(href: string) {
  const hash = href.indexOf('#')
  const path = hash === -1 ? href : href.slice(0, hash)
  const anchor = hash === -1 ? undefined : decodePath(href.slice(hash + 1))
  return {
    path: decodePath(path.split('?', 1)[0]),
    anchor: anchor || undefined,
  }
}

function normalizeLocalPath(path: string, windows: boolean) {
  const separator = windows ? '\\' : '/'
  const normalized = path.replace(/[\\/]+/g, separator)
  const drive =
    windows && /^[A-Za-z]:/.test(normalized) ? normalized.slice(0, 2) : ''
  const absolute = Boolean(drive) || normalized.startsWith(separator)
  const body = drive ? normalized.slice(2) : normalized
  const parts: string[] = []
  for (const part of body.split(separator)) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length && parts.at(-1) !== '..') parts.pop()
      else if (!absolute) parts.push(part)
    } else parts.push(part)
  }
  const prefix = drive ? `${drive}${separator}` : absolute ? separator : ''
  return `${prefix}${parts.join(separator)}` || prefix
}

export function resolveMarkdownPath(documentPath: string, href: string) {
  const { path, anchor } = splitHref(href.trim())
  if (!path) return anchor ? { anchor } : undefined
  const windows = /^[A-Za-z]:[\\/]/.test(documentPath)
  const absolute = path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
  const separator = windows ? '\\' : '/'
  const base = documentPath.replace(/[\\/][^\\/]*$/, '')
  return {
    path: normalizeLocalPath(
      absolute ? path : `${base}${separator}${path}`,
      windows,
    ),
    ...(anchor ? { anchor } : {}),
  }
}

export type MarkdownImageSource =
  | { kind: 'local'; path: string }
  | { kind: 'remote'; src: string }
  | { kind: 'unsupported' }

export function classifyMarkdownImageSource(
  documentPath: string,
  src: string,
): MarkdownImageSource {
  const value = src.trim()
  if (/^https?:\/\//i.test(value)) return { kind: 'remote', src: value }
  if (/^file:\/\//i.test(value)) {
    try {
      const path = decodeURIComponent(new URL(value).pathname)
      return path.startsWith('/')
        ? { kind: 'local', path: normalizeLocalPath(path, false) }
        : { kind: 'unsupported' }
    } catch {
      return { kind: 'unsupported' }
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return { kind: 'unsupported' }
  const resolved = resolveMarkdownPath(documentPath, value)
  return resolved && 'path' in resolved
    ? { kind: 'local', path: resolved.path }
    : { kind: 'unsupported' }
}
