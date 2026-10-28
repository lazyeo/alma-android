import { t } from '../i18n/runtime'
import type { DesktopStatus, Thread } from '../relay'

export interface ShareFile {
  name: string
  mimeType: string
  size: number
  dataUrl?: string
  path?: string
}

export interface SharePayload {
  text?: string
  subject?: string
  files: ShareFile[]
  shortcutId?: string
  error?: string
}

export interface SharedThreadSource {
  desktopId: string
  desktopName: string
  status: DesktopStatus
  note?: string
  threads: Thread[]
}

export interface SharedThreadRow {
  key: string
  desktopId: string
  desktopName: string
  threadId: string
  title: string
  updatedAt: number
  status: DesktopStatus
  note?: string
}

const textValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const timeValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export function normalizeSharePayload(
  value: unknown,
): SharePayload | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const files = Array.isArray(raw.files)
    ? raw.files.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') return []
        const file = candidate as Record<string, unknown>
        const name = textValue(file.name)
        const mimeType = textValue(file.mimeType)
        const dataUrl = textValue(file.dataUrl)
        const path = textValue(file.path)
        if (!name || !mimeType || (!dataUrl && !path)) return []
        return [
          {
            name,
            mimeType,
            size:
              typeof file.size === 'number' && Number.isFinite(file.size)
                ? file.size
                : 0,
            ...(dataUrl ? { dataUrl } : {}),
            ...(path ? { path } : {}),
          },
        ]
      })
    : []
  const payload: SharePayload = {
    ...(textValue(raw.text) ? { text: textValue(raw.text) } : {}),
    ...(textValue(raw.subject) ? { subject: textValue(raw.subject) } : {}),
    files,
    ...(textValue(raw.shortcutId)
      ? { shortcutId: textValue(raw.shortcutId) }
      : {}),
    ...(textValue(raw.error) ? { error: textValue(raw.error) } : {}),
  }
  return payload.text ||
    payload.subject ||
    payload.files.length ||
    payload.error
    ? payload
    : undefined
}

export function mergeSharedThreads(sources: SharedThreadSource[]) {
  return sources
    .flatMap((source) =>
      source.threads.flatMap((thread) =>
        thread.isIncognito || thread.parentThreadId
          ? []
          : [
              {
                key: `${source.desktopId}:${thread.id}`,
                desktopId: source.desktopId,
                desktopName: source.desktopName,
                threadId: thread.id,
                title: thread.title?.trim() || t('common.untitledThread'),
                updatedAt: timeValue(thread.updatedAt ?? thread.createdAt),
                status: source.status,
                note: source.note,
              } satisfies SharedThreadRow,
            ],
      ),
    )
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        left.title.localeCompare(right.title),
    )
}

export function searchSharedThreads(rows: SharedThreadRow[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return rows
  return rows.filter((row) =>
    `${row.title}\n${row.desktopName}`.toLocaleLowerCase().includes(needle),
  )
}

function encodePart(value: string) {
  return encodeURIComponent(value)
}

export function encodeThreadShortcutId(desktopId: string, threadId: string) {
  return `thread:${encodePart(desktopId)}:${encodePart(threadId)}`
}

export function encodeNewChatShortcutId(desktopId: string) {
  return `new:${encodePart(desktopId)}`
}

export type ShareShortcutTarget =
  | { kind: 'thread'; desktopId: string; threadId: string }
  | { kind: 'new-chat'; desktopId: string }

export function decodeShareShortcutId(
  value: string | undefined,
): ShareShortcutTarget | undefined {
  if (!value) return undefined
  const parts = value.split(':')
  try {
    if (parts.length === 3 && parts[0] === 'thread')
      return {
        kind: 'thread',
        desktopId: decodeURIComponent(parts[1]),
        threadId: decodeURIComponent(parts[2]),
      }
    if (parts.length === 2 && parts[0] === 'new-chat')
      return { kind: 'new-chat', desktopId: decodeURIComponent(parts[1]) }
    if (parts.length === 2 && parts[0] === 'new')
      return { kind: 'new-chat', desktopId: decodeURIComponent(parts[1]) }
  } catch {
    return undefined
  }
  return undefined
}

export function composeSharedMessage(payload: SharePayload, question: string) {
  const sections: string[] = []
  const prompt = question.trim()
  const subject = payload.subject?.trim()
  const text = payload.text?.trim()
  if (prompt) sections.push(prompt)
  const sharedText = [subject && subject !== text ? subject : '', text]
    .filter(Boolean)
    .join('\n')
  if (sharedText) sections.push(sharedText)
  if (!sections.length && payload.files.length)
    sections.push(
      t('share.sharedFiles', {
        names: payload.files
          .map((file) => file.name)
          .join(t('share.fileNameSeparator')),
      }),
    )
  return sections.join('\n\n')
}
