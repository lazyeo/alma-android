import {
  isPendingAttachment,
  type ComposerAttachment,
  type PendingAttachment,
} from './attachmentUpload'
import { attachmentStore, type AttachmentStore } from './attachmentStore'
import type { UploadedAttachment } from './messageParts'
import { parseMaterializedReferences } from './references'

export const DRAFT_STORAGE_KEY = 'alma-mobile.drafts.v1'
export const MAX_DRAFT_CHARS = 20_000
export const MAX_DRAFTS = 100
export const DRAFT_SAVE_DELAY_MS = 300

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PendingDraftAttachment {
  id: string
  kind: 'image' | 'file'
  name: string
  mediaType: string
  pendingKey: string
}

export type StoredDraftAttachment = UploadedAttachment | PendingDraftAttachment

export interface ThreadDraft {
  desktopId: string
  threadId: string
  text: string
  attachments: StoredDraftAttachment[]
  updatedAt: number
}

const pendingKey = (desktopId: string, threadId: string, attachmentId: string) =>
  `${encodeURIComponent(desktopId)}:${encodeURIComponent(threadId)}:${encodeURIComponent(attachmentId)}`

function storedUploadedAttachment(
  attachment: UploadedAttachment,
): UploadedAttachment | undefined {
  const { previewUrl: _previewUrl, ...stored } = attachment
  return Boolean(stored.url || stored.filePath) &&
    typeof stored.name === 'string' &&
    typeof stored.mediaType === 'string'
    ? stored
    : undefined
}

function storedAttachment(value: unknown): StoredDraftAttachment | undefined {
  if (!value || typeof value !== 'object') return undefined
  const attachment = value as Partial<StoredDraftAttachment>
  if (
    (attachment.kind !== 'image' && attachment.kind !== 'file') ||
    typeof attachment.name !== 'string' ||
    typeof attachment.mediaType !== 'string'
  )
    return undefined
  const pending = attachment as Partial<PendingDraftAttachment>
  if (
    typeof pending.id === 'string' &&
    typeof pending.pendingKey === 'string'
  )
    return pending as PendingDraftAttachment
  return storedUploadedAttachment(attachment as UploadedAttachment)
}

function persistentAttachments(
  desktopId: string,
  threadId: string,
  attachments: ComposerAttachment[],
): StoredDraftAttachment[] {
  return attachments.flatMap((attachment) => {
    if (isPendingAttachment(attachment)) {
      return [
        {
          id: attachment.id,
          kind: attachment.kind,
          name: attachment.name,
          mediaType: attachment.mediaType,
          pendingKey:
            attachment.pending.storeKey ||
            pendingKey(desktopId, threadId, attachment.id),
        },
      ]
    }
    const stored = storedUploadedAttachment(attachment)
    return stored ? [stored] : []
  })
}

interface DraftStore {
  drafts: Record<string, ThreadDraft>
}

const draftKey = (desktopId: string, threadId: string) =>
  `${encodeURIComponent(desktopId)}:${encodeURIComponent(threadId)}`

function readStore(storage: DraftStorage): DraftStore {
  try {
    const parsed = JSON.parse(storage.getItem(DRAFT_STORAGE_KEY) ?? '')
    if (!parsed || typeof parsed !== 'object' || !parsed.drafts) {
      return { drafts: {} }
    }
    const drafts = Object.fromEntries(
      Object.entries(parsed.drafts).filter(
        (entry): entry is [string, ThreadDraft] => {
          const value = entry[1] as Partial<ThreadDraft> | null
          if (
            !value ||
            typeof value.desktopId !== 'string' ||
            typeof value.threadId !== 'string' ||
            typeof value.text !== 'string' ||
            typeof value.updatedAt !== 'number'
          )
            return false
          value.attachments = (Array.isArray(value.attachments)
            ? value.attachments
            : []
          )
            .map(storedAttachment)
            .filter(
              (attachment): attachment is StoredDraftAttachment =>
                attachment !== undefined,
            )
          return true
        },
      ),
    )
    return { drafts }
  } catch {
    return { drafts: {} }
  }
}

function writeStore(storage: DraftStorage, store: DraftStore) {
  const drafts = Object.values(store.drafts)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DRAFTS)
  if (!drafts.length) {
    storage.removeItem(DRAFT_STORAGE_KEY)
    return
  }
  storage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      drafts: Object.fromEntries(
        drafts.map((draft) => [
          draftKey(draft.desktopId, draft.threadId),
          draft,
        ]),
      ),
    }),
  )
}

export function loadDraft(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
) {
  return readStore(storage).drafts[draftKey(desktopId, threadId)]
}

export async function loadDraftAttachments(
  attachments: StoredDraftAttachment[],
  blobs: AttachmentStore = attachmentStore,
): Promise<ComposerAttachment[]> {
  const restored: ComposerAttachment[] = []
  for (const attachment of attachments) {
    if (!('pendingKey' in attachment)) {
      restored.push(attachment)
      continue
    }
    const blob = await blobs.get(attachment.pendingKey)
    if (!blob) continue
    restored.push({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      mediaType: attachment.mediaType,
      previewUrl: URL.createObjectURL(blob),
      pending: { blob, storeKey: attachment.pendingKey },
    })
  }
  return restored
}

export function listDrafts(storage: DraftStorage, desktopId?: string) {
  return Object.values(readStore(storage).drafts)
    .filter((draft) => !desktopId || draft.desktopId === desktopId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDraft(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
  text: string,
  updatedAt = Date.now(),
  attachments: ComposerAttachment[] = [],
  blobs: AttachmentStore = attachmentStore,
) {
  const store = readStore(storage)
  const key = draftKey(desktopId, threadId)
  const previous = store.drafts[key]?.attachments ?? []
  const storedAttachments = persistentAttachments(
    desktopId,
    threadId,
    attachments,
  )
  if (!text.trim() && !storedAttachments.length) {
    delete store.drafts[key]
  } else {
    store.drafts[key] = {
      desktopId,
      threadId,
      text: text.slice(0, MAX_DRAFT_CHARS),
      attachments: storedAttachments,
      updatedAt,
    }
  }
  writeStore(storage, store)

  const nextKeys = new Set(
    storedAttachments.flatMap((attachment) =>
      'pendingKey' in attachment ? [attachment.pendingKey] : [],
    ),
  )
  await Promise.all([
    ...attachments.flatMap((attachment) =>
      isPendingAttachment(attachment)
        ? [
            blobs.put(
              attachment.pending.storeKey ||
                pendingKey(desktopId, threadId, attachment.id),
              attachment.pending.blob,
            ),
          ]
        : [],
    ),
    ...previous.flatMap((attachment) =>
      'pendingKey' in attachment && !nextKeys.has(attachment.pendingKey)
        ? [blobs.delete(attachment.pendingKey)]
        : [],
    ),
  ])
}

export async function clearDraft(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
  blobs: AttachmentStore = attachmentStore,
) {
  const store = readStore(storage)
  const attachments = store.drafts[draftKey(desktopId, threadId)]?.attachments ?? []
  delete store.drafts[draftKey(desktopId, threadId)]
  writeStore(storage, store)
  await Promise.all(
    attachments.flatMap((attachment) =>
      'pendingKey' in attachment ? [blobs.delete(attachment.pendingKey)] : [],
    ),
  )
}

/** One-line preview for thread rows; drafts may contain newlines. */
export function draftSnippet(text: string, maxChars = 60) {
  const line = parseMaterializedReferences(text)
    .text.replace(/\s+/g, ' ')
    .trim()
  return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line
}

export function createDraftAutosave(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
  delayMs = DRAFT_SAVE_DELAY_MS,
  blobs: AttachmentStore = attachmentStore,
) {
  const restored = loadDraft(storage, desktopId, threadId)
  let persisted = restored?.text ?? ''
  let persistedAttachments = restored?.attachments ?? []
  let pending: { text: string; attachments: ComposerAttachment[] } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
    pending = undefined
  }
  const flush = () => {
    if (pending === undefined) return
    const { text, attachments } = pending
    cancel()
    void saveDraft(
      storage,
      desktopId,
      threadId,
      text,
      Date.now(),
      attachments,
      blobs,
    )
    persisted = text.trim() ? text.slice(0, MAX_DRAFT_CHARS) : ''
    persistedAttachments = persistentAttachments(
      desktopId,
      threadId,
      attachments,
    )
  }

  return {
    savedText: () => persisted,
    savedAttachments: () => persistedAttachments,
    async restoreAttachments() {
      return loadDraftAttachments(persistedAttachments, blobs)
    },
    update(text: string, attachments: ComposerAttachment[] = []) {
      const storedAttachments = persistentAttachments(
        desktopId,
        threadId,
        attachments,
      )
      if (
        text === persisted &&
        JSON.stringify(storedAttachments) ===
          JSON.stringify(persistedAttachments)
      ) {
        cancel()
        return
      }
      pending = { text, attachments }
      clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    flush,
    clear() {
      cancel()
      persisted = ''
      persistedAttachments = []
      void clearDraft(storage, desktopId, threadId, blobs)
    },
  }
}

export type DraftAutosave = ReturnType<typeof createDraftAutosave>
