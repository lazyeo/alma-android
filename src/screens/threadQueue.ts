import type { UploadedAttachment } from './messageParts'

export const THREAD_QUEUE_STORAGE_KEY = 'alma-mobile.thread-queues.v1'
const MAX_QUEUES = 100
const MAX_QUEUE_ITEMS = 50
const MAX_CONTENT_CHARS = 20_000

export interface QueueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface QueuedMessage {
  id: string
  content: string
  attachedFiles: UploadedAttachment[]
  timestamp: number
}

export interface ThreadQueueState {
  messages: QueuedMessage[]
  autoSendWhenIdle: boolean
}

interface StoredQueue extends ThreadQueueState {
  desktopId: string
  threadId: string
  updatedAt: number
}

interface QueueStore {
  queues: Record<string, StoredQueue>
}

const queueKey = (desktopId: string, threadId: string) =>
  `${encodeURIComponent(desktopId)}:${encodeURIComponent(threadId)}`

function storedAttachment(value: unknown): UploadedAttachment | undefined {
  if (!value || typeof value !== 'object') return undefined
  const attachment = value as Partial<UploadedAttachment>
  if (
    (attachment.kind !== 'image' && attachment.kind !== 'file') ||
    typeof attachment.name !== 'string' ||
    typeof attachment.mediaType !== 'string'
  ) {
    return undefined
  }
  if (attachment.kind === 'image' && typeof attachment.url !== 'string') {
    return undefined
  }
  if (attachment.kind === 'file' && typeof attachment.filePath !== 'string') {
    return undefined
  }
  return {
    kind: attachment.kind,
    name: attachment.name,
    mediaType: attachment.mediaType,
    ...(attachment.url ? { url: attachment.url } : {}),
    ...(attachment.filePath ? { filePath: attachment.filePath } : {}),
  }
}

function validMessages(value: unknown): QueuedMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is QueuedMessage =>
      Boolean(
        item &&
        typeof item.id === 'string' &&
        typeof item.content === 'string' &&
        typeof item.timestamp === 'number' &&
        Array.isArray(item.attachedFiles),
      ),
    )
    .map((item) => ({
      id: item.id,
      content: item.content.slice(0, MAX_CONTENT_CHARS),
      attachedFiles: item.attachedFiles
        .map(storedAttachment)
        .filter((attachment): attachment is UploadedAttachment =>
          Boolean(attachment),
        ),
      timestamp: item.timestamp,
    }))
    .filter((item) => item.content.trim() || item.attachedFiles.length)
    .slice(0, MAX_QUEUE_ITEMS)
}

function readStore(storage: QueueStorage): QueueStore {
  try {
    const parsed = JSON.parse(storage.getItem(THREAD_QUEUE_STORAGE_KEY) ?? '')
    if (!parsed || typeof parsed !== 'object' || !parsed.queues) {
      return { queues: {} }
    }
    const queues = Object.fromEntries(
      Object.entries(parsed.queues).flatMap(([key, raw]) => {
        const queue = raw as Partial<StoredQueue> | null
        if (
          !queue ||
          typeof queue.desktopId !== 'string' ||
          typeof queue.threadId !== 'string' ||
          typeof queue.updatedAt !== 'number'
        ) {
          return []
        }
        const messages = validMessages(queue.messages)
        return messages.length
          ? [
              [
                key,
                {
                  ...queue,
                  messages,
                  autoSendWhenIdle: queue.autoSendWhenIdle === true,
                } as StoredQueue,
              ],
            ]
          : []
      }),
    )
    return { queues }
  } catch {
    return { queues: {} }
  }
}

function writeStore(storage: QueueStorage, store: QueueStore) {
  const queues = Object.values(store.queues)
    .filter((queue) => queue.messages.length)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_QUEUES)
  if (!queues.length) {
    storage.removeItem(THREAD_QUEUE_STORAGE_KEY)
    return
  }
  storage.setItem(
    THREAD_QUEUE_STORAGE_KEY,
    JSON.stringify({
      queues: Object.fromEntries(
        queues.map((queue) => [
          queueKey(queue.desktopId, queue.threadId),
          queue,
        ]),
      ),
    }),
  )
}

export function addQueuedMessage(
  queue: QueuedMessage[],
  content: string,
  attachedFiles: UploadedAttachment[] = [],
  timestamp = Date.now(),
  id = `queued-${timestamp}-${queue.length}`,
): QueuedMessage[] {
  const item = {
    id,
    content: content.trim().slice(0, MAX_CONTENT_CHARS),
    attachedFiles: attachedFiles.flatMap((attachment) => {
      const stored = storedAttachment(attachment)
      return stored ? [stored] : []
    }),
    timestamp,
  }
  if (!item.content && !item.attachedFiles.length) return queue
  return [...queue, item].slice(-MAX_QUEUE_ITEMS)
}

export function editQueuedMessage(
  queue: QueuedMessage[],
  id: string,
  content: string,
): QueuedMessage[] {
  return queue.map((item) =>
    item.id === id
      ? { ...item, content: content.trim().slice(0, MAX_CONTENT_CHARS) }
      : item,
  )
}

export function commitQueuedMessageEdit(
  queue: QueuedMessage[],
  id: string,
  content: string,
): QueuedMessage[] {
  const item = queue.find((message) => message.id === id)
  if (!item || (!content.trim() && !item.attachedFiles.length)) return queue
  return editQueuedMessage(queue, id, content)
}

export function removeQueuedMessage(queue: QueuedMessage[], id: string) {
  return queue.filter((item) => item.id !== id)
}

export function moveQueuedMessage(
  queue: QueuedMessage[],
  dragId: string,
  overId: string,
  placeAfter: boolean,
): QueuedMessage[] {
  if (dragId === overId) return queue
  const moving = queue.find((item) => item.id === dragId)
  if (!moving || !queue.some((item) => item.id === overId)) return queue
  const without = queue.filter((item) => item.id !== dragId)
  const overIndex = without.findIndex((item) => item.id === overId)
  return moveQueuedMessageToIndex(
    queue,
    dragId,
    overIndex + (placeAfter ? 1 : 0),
  )
}

export function moveQueuedMessageToIndex(
  queue: QueuedMessage[],
  dragId: string,
  targetIndex: number,
): QueuedMessage[] {
  const moving = queue.find((item) => item.id === dragId)
  if (!moving) return queue
  const without = queue.filter((item) => item.id !== dragId)
  const insertAt = Math.max(
    0,
    Math.min(Math.floor(targetIndex), without.length),
  )
  return [...without.slice(0, insertAt), moving, ...without.slice(insertAt)]
}

export function queueDragTargetIndex(
  pointerY: number,
  rowMidpoints: number[],
): number {
  const index = rowMidpoints.findIndex((midpoint) => pointerY < midpoint)
  return index === -1 ? rowMidpoints.length : index
}

export function combineQueuedMessages(queue: QueuedMessage[]) {
  return {
    content: queue
      .map((item) => item.content.trim())
      .filter(Boolean)
      .join('\n\n'),
    attachments: queue.flatMap((item) => item.attachedFiles),
  }
}

export function restoreFailedSteer(
  queue: QueuedMessage[],
  item: QueuedMessage,
  originalIndex: number,
) {
  if (queue.some((queued) => queued.id === item.id)) return queue
  const index = Math.max(0, Math.min(originalIndex, queue.length))
  return [...queue.slice(0, index), item, ...queue.slice(index)]
}

export function idleQueueShouldAutoSend(input: {
  generating: boolean
  autoSendWhenIdle: boolean
  queueLength: number
  online: boolean
  socketReady: boolean
  alreadySending: boolean
  editingQueuedItem: boolean
}) {
  return (
    !input.generating &&
    input.autoSendWhenIdle &&
    input.queueLength > 0 &&
    input.online &&
    input.socketReady &&
    !input.alreadySending &&
    !input.editingQueuedItem
  )
}

export function loadThreadQueueState(
  storage: QueueStorage,
  desktopId: string,
  threadId: string,
): ThreadQueueState {
  const stored = readStore(storage).queues[queueKey(desktopId, threadId)]
  return stored
    ? {
        messages: stored.messages,
        autoSendWhenIdle: stored.autoSendWhenIdle,
      }
    : { messages: [], autoSendWhenIdle: false }
}

export function loadThreadQueue(
  storage: QueueStorage,
  desktopId: string,
  threadId: string,
) {
  return (
    readStore(storage).queues[queueKey(desktopId, threadId)]?.messages ?? []
  )
}

export function saveThreadQueue(
  storage: QueueStorage,
  desktopId: string,
  threadId: string,
  messages: QueuedMessage[],
  autoSendWhenIdle = false,
  updatedAt = Date.now(),
) {
  const store = readStore(storage)
  const key = queueKey(desktopId, threadId)
  const persistable = validMessages(messages)
  if (persistable.length) {
    store.queues[key] = {
      desktopId,
      threadId,
      messages: persistable,
      autoSendWhenIdle,
      updatedAt,
    }
  } else {
    delete store.queues[key]
  }
  writeStore(storage, store)
}

export function listQueuedThreads(storage: QueueStorage, desktopId: string) {
  return Object.values(readStore(storage).queues)
    .filter((queue) => queue.desktopId === desktopId)
    .map((queue) => ({
      threadId: queue.threadId,
      count: queue.messages.length,
    }))
}
