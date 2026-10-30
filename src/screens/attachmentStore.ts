export const MAX_STORED_ATTACHMENT_BYTES = 25 * 1024 * 1024

const DATABASE_NAME = 'alma-mobile-attachments'
const DATABASE_VERSION = 1
const STORE_NAME = 'blobs'

export interface AttachmentStore {
  get(key: string): Promise<Blob | undefined>
  put(key: string, blob: Blob): Promise<void>
  delete(key: string): Promise<void>
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function createAttachmentStore(
  providedFactory?: IDBFactory,
): AttachmentStore {
  let database: Promise<IDBDatabase> | undefined
  const open = () => {
    const factory = providedFactory ?? globalThis.indexedDB
    if (!factory) return Promise.reject(new Error('IndexedDB is unavailable'))
    database ??= new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return database
  }
  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE_NAME, mode).objectStore(STORE_NAME)

  return {
    async get(key) {
      const objectStore = await store('readonly')
      const value = await requestResult(objectStore.get(key))
      return value instanceof Blob ? value : undefined
    },
    async put(key, blob) {
      if (blob.size > MAX_STORED_ATTACHMENT_BYTES) {
        throw new Error('Attachment is too large to save in a draft')
      }
      const objectStore = await store('readwrite')
      await requestResult(objectStore.put(blob, key))
    },
    async delete(key) {
      const objectStore = await store('readwrite')
      await requestResult(objectStore.delete(key))
    },
  }
}

export const attachmentStore = createAttachmentStore()
