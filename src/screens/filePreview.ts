import { fallbackMimeType, isTextPreview } from './localFiles'
import { isHtmlFile } from './htmlPreview'
import { isMarkdownFile } from './markdownPreview'
export function previewMime(name: string, mime: string) {
  const fallback = fallbackMimeType(name)
  return mime === 'application/octet-stream' || /\.svg$/i.test(name)
    ? fallback
    : mime
}
export function previewKind(name: string, mime: string) {
  mime = previewMime(name, mime)
  if (/\.csv$/i.test(name) || mime === 'text/csv') return 'csv'
  if (/\.xlsx$/i.test(name) || mime === fallbackMimeType('a.xlsx'))
    return 'xlsx'
  if (/\.docx$/i.test(name) || mime === fallbackMimeType('a.docx'))
    return 'docx'
  if (isHtmlFile(name)) return 'html'
  if (isMarkdownFile(name, mime)) return 'markdown'
  if (mime === 'image/svg+xml') return 'svg'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (isTextPreview(mime, name)) return 'text'
  return 'none'
}

export type PreviewKind = ReturnType<typeof previewKind>
const MiB = 1024 * 1024
export const PREVIEW_LIMITS: Record<Exclude<PreviewKind, 'none'>, number> = {
  csv: MiB,
  xlsx: 10 * MiB,
  docx: 5 * MiB,
  html: MiB,
  markdown: MiB,
  text: MiB,
  svg: MiB,
  image: 10 * MiB,
  audio: 50 * MiB,
  video: 50 * MiB,
  pdf: 20 * MiB,
}
export type PreviewPolicy =
  | { status: 'unsupported'; kind: 'none' }
  | { status: 'ready'; kind: Exclude<PreviewKind, 'none'> }
  | { status: 'too-large'; kind: Exclude<PreviewKind, 'none'>; limit: number }
export function previewPolicy(
  name: string,
  mime: string,
  size: number,
): PreviewPolicy {
  const kind = previewKind(name, mime)
  if (kind === 'none') return { status: 'unsupported', kind }
  const limit = PREVIEW_LIMITS[kind]
  return size > limit
    ? { status: 'too-large', kind, limit }
    : { status: 'ready', kind }
}
