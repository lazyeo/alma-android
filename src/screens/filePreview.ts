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
