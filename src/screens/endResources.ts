import type { MessagePart } from '../relay'
import { t } from '../i18n/runtime'

export type EndResource =
  | { type: 'file'; path: string; description?: string }
  | {
      type: 'website'
      target: string
      title?: string
      description?: string
    }

export type EndResourceLocation = 'temp' | 'project' | 'global' | 'computer'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const optionalText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const validWebsiteTarget = (value: string) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname)
  } catch {
    return false
  }
}

const isAbsolutePath = (path: string) =>
  path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)

const normalizePath = (path: string) => path.replace(/\\/g, '/')

const joinWorkspacePath = (workspacePath: string, relativePath: string) =>
  `${workspacePath.replace(/[\\/]$/, '')}/${relativePath.replace(/^[\\/]/, '')}`

export function parseEndResources(value: unknown): EndResource[] {
  if (!Array.isArray(value)) return []
  const resources: EndResource[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (entry.type === 'file') {
      const path = optionalText(entry.path)
      if (!path || !isAbsolutePath(path)) continue
      const description = optionalText(entry.description)
      resources.push({
        type: 'file',
        path,
        ...(description ? { description } : {}),
      })
      continue
    }
    if (entry.type === 'website') {
      const target = optionalText(entry.target)
      if (!target || !validWebsiteTarget(target)) continue
      const title = optionalText(entry.title)
      const description = optionalText(entry.description)
      resources.push({
        type: 'website',
        target,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
      })
    }
  }
  return resources
}

function completedToolPath(part: MessagePart, workspacePath?: string) {
  if (
    !['tool-Write', 'tool-Edit'].includes(part.type) ||
    !['output-available', 'done'].includes(part.state ?? '')
  )
    return undefined
  const output = isRecord(part.output) ? part.output : undefined
  const input = isRecord(part.input) ? part.input : undefined
  const path = optionalText(output?.file_path) ?? optionalText(input?.file_path)
  if (!path) return undefined
  if (isAbsolutePath(path)) return path
  return workspacePath ? joinWorkspacePath(workspacePath, path) : undefined
}

export function deriveEndResources(
  message: {
    parts: MessagePart[]
    metadata?: Record<string, unknown>
  },
  workspacePath?: string,
): EndResource[] {
  const resources = [
    ...parseEndResources(message.metadata?.endResources),
    ...message.parts.flatMap((part) => {
      const path = completedToolPath(part, workspacePath)
      return path ? [{ type: 'file' as const, path }] : []
    }),
  ]
  const seen = new Set<string>()
  return resources.filter((resource) => {
    const key = resource.type === 'file' ? resource.path : resource.target
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const CATEGORY_BY_EXTENSION: Record<
  string,
  'document' | 'spreadsheet' | 'presentation' | 'image' | 'archive'
> = {
  apk: 'document',
  doc: 'document',
  docx: 'document',
  html: 'document',
  md: 'document',
  pdf: 'document',
  txt: 'document',
  csv: 'spreadsheet',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  odp: 'presentation',
  ppt: 'presentation',
  pptx: 'presentation',
  avif: 'image',
  gif: 'image',
  heic: 'image',
  jpeg: 'image',
  jpg: 'image',
  png: 'image',
  svg: 'image',
  webp: 'image',
  '7z': 'archive',
  gz: 'archive',
  rar: 'archive',
  tar: 'archive',
  zip: 'archive',
}

function fileExtension(path: string) {
  const name = path.split(/[\\/]/).pop() ?? ''
  return name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''
}

/** Language-independent kind, for picking an icon. */
export function endResourceCategory(path: string) {
  return CATEGORY_BY_EXTENSION[fileExtension(path)] ?? 'file'
}

export function endResourceSubtitle(path: string) {
  const extension = fileExtension(path)
  return extension
    ? t(`message.resources.kind.${endResourceCategory(path)}`, {
        extension: extension.toUpperCase(),
      })
    : t('message.resources.file')
}

export function endResourceLocation(
  path: string,
  workspacePath?: string,
): EndResourceLocation {
  const normalized = normalizePath(path)
  const workspace =
    workspacePath && normalizePath(workspacePath).replace(/\/$/, '')
  if (
    normalized.startsWith('/tmp/') ||
    normalized.startsWith('/var/tmp/') ||
    normalized.startsWith('/var/folders/') ||
    normalized.startsWith('/private/var/folders/')
  )
    return 'temp'
  if (
    workspace &&
    (normalized === workspace || normalized.startsWith(`${workspace}/`))
  )
    return 'project'
  if (
    /\/(?:\.claude|\.alma|\.config)(?:\/|$)/.test(normalized) ||
    normalized.includes('/Library/Application Support/')
  )
    return 'global'
  return 'computer'
}
