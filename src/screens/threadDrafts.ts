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

export interface ThreadDraft {
  desktopId: string
  threadId: string
  text: string
  attachments: UploadedAttachment[]
  updatedAt: number
}

function persistentAttachments(attachments: UploadedAttachment[]) {
  return attachments
    .map(({ previewUrl: _previewUrl, ...attachment }) => attachment)
    .filter(
      (attachment) =>
        Boolean(attachment.url || attachment.filePath) &&
        typeof attachment.name === 'string' &&
        typeof attachment.mediaType === 'string',
    )
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
          value.attachments = persistentAttachments(
            Array.isArray(value.attachments) ? value.attachments : [],
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

export function listDrafts(storage: DraftStorage, desktopId?: string) {
  return Object.values(readStore(storage).drafts)
    .filter((draft) => !desktopId || draft.desktopId === desktopId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveDraft(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
  text: string,
  updatedAt = Date.now(),
  attachments: UploadedAttachment[] = [],
) {
  const store = readStore(storage)
  const key = draftKey(desktopId, threadId)
  const storedAttachments = persistentAttachments(attachments)
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
}

export function clearDraft(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
) {
  const store = readStore(storage)
  delete store.drafts[draftKey(desktopId, threadId)]
  writeStore(storage, store)
}

/** One-line preview for thread rows; drafts may contain newlines. */
export function draftSnippet(text: string, maxChars = 60) {
  const line = parseMaterializedReferences(text)
    .text.replace(/\s+/g, ' ')
    .trim()
  return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line
}

/**
 * Debounced writer for one desktop+thread draft. Keystrokes are coalesced so
 * localStorage is not rewritten per character; callers must `flush` when the
 * page may be torn down (unmount, hidden, pagehide) to avoid losing the tail.
 */
export function createDraftAutosave(
  storage: DraftStorage,
  desktopId: string,
  threadId: string,
  delayMs = DRAFT_SAVE_DELAY_MS,
) {
  const restored = loadDraft(storage, desktopId, threadId)
  let persisted = restored?.text ?? ''
  let persistedAttachments = restored?.attachments ?? []
  let pending: { text: string; attachments: UploadedAttachment[] } | undefined
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
    saveDraft(storage, desktopId, threadId, text, Date.now(), attachments)
    persisted = text.trim() ? text.slice(0, MAX_DRAFT_CHARS) : ''
    persistedAttachments = persistentAttachments(attachments)
  }

  return {
    savedText: () => persisted,
    savedAttachments: () => persistedAttachments,
    update(text: string, attachments: UploadedAttachment[] = []) {
      const storedAttachments = persistentAttachments(attachments)
      if (
        text === persisted &&
        JSON.stringify(storedAttachments) ===
          JSON.stringify(persistedAttachments)
      ) {
        cancel()
        return
      }
      pending = { text, attachments: storedAttachments }
      clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    flush,
    clear() {
      cancel()
      persisted = ''
      persistedAttachments = []
      clearDraft(storage, desktopId, threadId)
    },
  }
}

export type DraftAutosave = ReturnType<typeof createDraftAutosave>
