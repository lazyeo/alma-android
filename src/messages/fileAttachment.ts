/** Language-independent file kind, for picking a non-image attachment's icon. */
export type FileAttachmentKind =
  '3d' | 'archive' | 'document' | 'code' | 'audio' | 'video' | 'file'

const KIND_BY_EXTENSION: Record<string, FileAttachmentKind> = {
  '3mf': '3d',
  gcode: '3d',
  obj: '3d',
  step: '3d',
  stl: '3d',
  stp: '3d',
  '7z': 'archive',
  bz2: 'archive',
  gz: 'archive',
  rar: 'archive',
  tar: 'archive',
  tgz: 'archive',
  xz: 'archive',
  zip: 'archive',
  doc: 'document',
  docx: 'document',
  md: 'document',
  odt: 'document',
  pdf: 'document',
  rtf: 'document',
  txt: 'document',
  c: 'code',
  cpp: 'code',
  cs: 'code',
  css: 'code',
  go: 'code',
  h: 'code',
  html: 'code',
  java: 'code',
  js: 'code',
  json: 'code',
  jsx: 'code',
  kt: 'code',
  mjs: 'code',
  php: 'code',
  py: 'code',
  rb: 'code',
  rs: 'code',
  sh: 'code',
  sql: 'code',
  swift: 'code',
  toml: 'code',
  ts: 'code',
  tsx: 'code',
  xml: 'code',
  yaml: 'code',
  yml: 'code',
  aac: 'audio',
  flac: 'audio',
  m4a: 'audio',
  mp3: 'audio',
  ogg: 'audio',
  opus: 'audio',
  wav: 'audio',
  avi: 'video',
  mkv: 'video',
  mov: 'video',
  mp4: 'video',
  webm: 'video',
}

const KIND_BY_MEDIA_TYPE: Record<string, FileAttachmentKind> = {
  'application/gzip': 'archive',
  'application/vnd.rar': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/x-bzip2': 'archive',
  'application/x-gzip': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-tar': 'archive',
  'application/zip': 'archive',
  'application/msword': 'document',
  'application/pdf': 'document',
  'application/rtf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'application/javascript': 'code',
  'application/json': 'code',
  'application/x-sh': 'code',
  'application/xml': 'code',
  'text/css': 'code',
  'text/html': 'code',
  'text/javascript': 'code',
  'text/xml': 'code',
}

function extension(name: string) {
  const dot = name.lastIndexOf('.')
  // A leading dot is a hidden file (".env"), not an extension.
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function mediaTypeKind(mediaType: string): FileAttachmentKind {
  const essence = mediaType.split(';')[0].trim().toLowerCase()
  const known = KIND_BY_MEDIA_TYPE[essence]
  if (known) return known
  const [type] = essence.split('/')
  if (type === 'model') return '3d'
  if (type === 'audio') return 'audio'
  if (type === 'video') return 'video'
  if (type === 'text') return 'document'
  return 'file'
}

/**
 * The extension wins over the media type: pickers report many files as
 * `application/octet-stream`, and Android calls `.ts` sources `video/mp2t`.
 */
export function fileAttachmentKind(
  name: string,
  mediaType: string,
): FileAttachmentKind {
  return KIND_BY_EXTENSION[extension(name)] ?? mediaTypeKind(mediaType)
}

/** "3MF" for `plate.3mf`; empty when the name has no extension. */
export function fileExtensionLabel(name: string) {
  return extension(name).toUpperCase()
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
