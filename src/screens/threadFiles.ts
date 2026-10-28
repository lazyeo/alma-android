import type { MessagePart, MessageRow, ThreadFileWrite } from '../relay'
import { t } from '../i18n/runtime'
import { deriveEndResources, type EndResource } from './endResources'

export type FileWriteEntry = ThreadFileWrite

export interface ChangedFile {
  filePath: string
  relativePath: string
  directory: string
  writes: number
  edits: number
  additions: number
  deletions: number
  lastTimestamp: string
  viaSubagent: boolean
}

export interface UserAttachment {
  kind: 'image' | 'file'
  source: string
  name: string
  mediaType?: string
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined

const absolutePath = (path: string, workspacePath?: string) => {
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return path
  if (!workspacePath) return undefined
  return `${workspacePath.replace(/[\\/]$/, '')}/${path.replace(/^[\\/]/, '')}`
}

const lineCount = (value: string) => (value ? value.split(/\r?\n/).length : 0)

function aliasedRelativePath(filePath: string, workspacePath: string) {
  const fileSegments = filePath.split('/').filter(Boolean)
  const workspaceSegments = workspacePath.split('/').filter(Boolean)
  for (let length = workspaceSegments.length; length >= 2; length -= 1) {
    const suffix = workspaceSegments.slice(-length)
    for (let index = 0; index <= fileSegments.length - length; index += 1) {
      if (
        suffix.every(
          (segment, offset) => segment === fileSegments[index + offset],
        )
      )
        return fileSegments.slice(index + length).join('/') || '.'
    }
  }
  return undefined
}

export function relativeFileLocation(
  filePath: string,
  workspacePath?: string,
): Pick<ChangedFile, 'relativePath' | 'directory'> {
  const normalized = filePath.replace(/\\/g, '/')
  const workspace = workspacePath?.replace(/\\/g, '/').replace(/\/$/, '')
  const exactRelative =
    workspace &&
    (normalized === workspace || normalized.startsWith(`${workspace}/`))
      ? normalized.slice(workspace.length).replace(/^\//, '') || '.'
      : undefined
  const relativePath =
    exactRelative ??
    (workspace ? aliasedRelativePath(normalized, workspace) : undefined) ??
    normalized
  const slash = relativePath.lastIndexOf('/')
  return {
    relativePath,
    directory: slash < 0 ? '.' : relativePath.slice(0, slash) || '/',
  }
}

export function classifyFileWrite(entry: FileWriteEntry) {
  if (entry.type === 'edit') return t('files.sheet.writeKind.edit')
  if (entry.previousContent === undefined)
    return t('files.sheet.writeKind.written')
  return entry.previousContent === ''
    ? t('files.sheet.writeKind.newFile')
    : t('files.sheet.writeKind.overwrite')
}

export function aggregateFileWrites(
  entries: readonly FileWriteEntry[],
  threadId: string,
  workspacePath?: string,
): ChangedFile[] {
  const files = new Map<
    string,
    Omit<ChangedFile, 'relativePath' | 'directory' | 'viaSubagent'> & {
      allSubagent: boolean
    }
  >()
  const subagentPrefix = `${threadId}--subagent-`
  for (const entry of entries) {
    const current = files.get(entry.filePath) ?? {
      filePath: entry.filePath,
      writes: 0,
      edits: 0,
      additions: 0,
      deletions: 0,
      lastTimestamp: entry.timestamp,
      allSubagent: true,
    }
    if (entry.type === 'write') {
      current.writes += 1
      current.additions += lineCount(entry.content)
      current.deletions += lineCount(entry.previousContent ?? '')
    } else {
      current.edits += 1
      current.additions += lineCount(entry.newString)
      current.deletions += lineCount(entry.oldString)
    }
    if (entry.timestamp > current.lastTimestamp)
      current.lastTimestamp = entry.timestamp
    current.allSubagent &&= entry.messageId.startsWith(subagentPrefix)
    files.set(entry.filePath, current)
  }
  return [...files.values()]
    .map(({ allSubagent, ...file }) => ({
      ...file,
      ...relativeFileLocation(file.filePath, workspacePath),
      viaSubagent: allSubagent,
    }))
    .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp))
}

export function collectDeliveredResources(
  rows: readonly MessageRow[],
  workspacePath?: string,
): EndResource[] {
  const seen = new Set<string>()
  const delivered: EndResource[] = []
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row.message.role !== 'assistant') continue
    for (const resource of deriveEndResources(
      {
        parts: row.message.parts,
        metadata: row.metadata,
      },
      workspacePath,
    )) {
      const key = resource.type === 'file' ? resource.path : resource.target
      if (seen.has(key)) continue
      seen.add(key)
      delivered.push(resource)
    }
  }
  return delivered
}

function completedTool(part: MessagePart) {
  return (
    ['tool-Write', 'tool-Edit'].includes(part.type) &&
    ['output-available', 'done'].includes(part.state ?? '')
  )
}

export function collectFallbackFileWrites(
  rows: readonly MessageRow[],
  workspacePath?: string,
): FileWriteEntry[] {
  const entries: FileWriteEntry[] = []
  for (const row of rows) {
    if (row.message.role !== 'assistant') continue
    for (const part of row.message.parts) {
      if (!completedTool(part)) continue
      const input = record(part.input)
      const output = record(part.output)
      const filePath = absolutePath(
        text(output?.file_path) ?? text(input?.file_path) ?? '',
        workspacePath,
      )
      if (!filePath) continue
      const timestamp = new Date(
        typeof row.updatedAt === 'number'
          ? row.updatedAt
          : typeof row.updatedAt === 'string'
            ? row.updatedAt
            : typeof row.timestamp === 'number'
              ? row.timestamp
              : 0,
      ).toISOString()
      const common = {
        filePath,
        messageId: row.message.id,
        toolCallId: part.toolCallId ?? `${row.message.id}-${entries.length}`,
        timestamp,
      }
      if (part.type === 'tool-Write') {
        entries.push({
          type: 'write',
          ...common,
          content: text(input?.content) ?? '',
          previousContent: text(input?.previous_content),
        })
      } else {
        entries.push({
          type: 'edit',
          ...common,
          oldString: text(input?.old_string) ?? '',
          newString: text(input?.new_string) ?? '',
          replaceAll: Boolean(input?.replace_all),
        })
      }
    }
  }
  return entries
}

export function extractUserAttachments(
  rows: readonly MessageRow[],
): UserAttachment[] {
  const attachments: UserAttachment[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.message.role !== 'user') continue
    for (const part of row.message.parts) {
      if (part.type !== 'image' && part.type !== 'file') continue
      const url = text(part.url)
      const filePath = text(part.filePath)
      const source = filePath ?? url
      if (!source || seen.has(source)) continue
      seen.add(source)
      const mediaType = text(part.mediaType)
      attachments.push({
        kind:
          part.type === 'image' || mediaType?.startsWith('image/')
            ? 'image'
            : 'file',
        source,
        name: text(part.filename) ?? source.split(/[\\/]/).pop() ?? 'File',
        mediaType,
      })
    }
  }
  return attachments
}
