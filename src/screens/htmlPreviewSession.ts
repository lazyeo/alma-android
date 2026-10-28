import { registerPlugin } from '@capacitor/core'
import { isAndroidNative } from '../nativeRuntime'
import type { AlmaApi } from '../relay/almaApi'
import {
  nativePreviewOrigin,
  normalizePreviewPath,
  previewFilePath,
  previewMimeType,
  previewRootDirectory,
} from './htmlPreview'
import { fileName, validateFileSize } from './localFiles'

/** Native waits this long for a response before answering 504 itself. */
export const NATIVE_PREVIEW_TIMEOUT_MS = 20_000
const CHUNK_BYTES = 256 * 1024

export interface HtmlPreviewRequest {
  requestId: string
  token: string
  /** Already normalized natively; normalized again here before use. */
  path: string
}

/** Contract of HtmlPreviewPlugin.java. */
export interface HtmlPreviewNative {
  openSession(options: {
    rootPath: string
  }): Promise<{ token: string; ownerKey: string }>
  closeSession(options: { token: string; ownerKey: string }): Promise<void>
  respond(options: {
    requestId: string
    ownerKey: string
    status: number
    mimeType: string
    base64Chunks: string[]
  }): Promise<void>
  addListener(
    event: 'request',
    listener: (request: HtmlPreviewRequest) => void,
  ): Promise<{ remove(): Promise<void> }>
}

export interface HtmlPreviewSession {
  url: string
  close(): Promise<void>
}

interface LiveSession {
  api: Pick<AlmaApi, 'tunnel'>
  root: string
  entryName: string
  ownerKey: string
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

const headerValue = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1]

/**
 * Answers the WebView's intercepted preview requests through the relay
 * tunnel. Only tokens opened here and not yet closed are served.
 */
export function createHtmlPreviewSessions(native: HtmlPreviewNative) {
  const live = new Map<string, LiveSession>()
  let listening: Promise<unknown> | undefined

  const serve = async ({ requestId, token, path }: HtmlPreviewRequest) => {
    const session = live.get(token)
    const normalized = normalizePreviewPath(`/${path}`)
    if (!session || !normalized.ok) {
      await native.respond({
        requestId,
        ownerKey: session?.ownerKey ?? '',
        status: 403,
        mimeType: 'text/plain',
        base64Chunks: [],
      })
      return
    }
    const filePath = previewFilePath(
      session.root,
      session.entryName,
      normalized.path,
    )
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      NATIVE_PREVIEW_TIMEOUT_MS,
    )
    try {
      const response = await session.api.tunnel.fetch(
        `/api/files-abs-binary?path=${encodeURIComponent(filePath)}`,
        { method: 'GET', signal: controller.signal },
      )
      if (response.status < 200 || response.status >= 300) {
        await native.respond({
          requestId,
          ownerKey: session.ownerKey,
          status: response.status === 404 ? 404 : 502,
          mimeType: 'text/plain',
          base64Chunks: [],
        })
        return
      }
      const bytes = await response.bytes()
      validateFileSize(bytes.byteLength)
      // The session may have closed while the relay was fetching.
      if (!live.has(token)) {
        await native.respond({
          requestId,
          ownerKey: session.ownerKey,
          status: 403,
          mimeType: 'text/plain',
          base64Chunks: [],
        })
        return
      }
      const base64Chunks: string[] = []
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES)
        base64Chunks.push(
          toBase64(bytes.subarray(offset, offset + CHUNK_BYTES)),
        )
      await native.respond({
        requestId,
        ownerKey: session.ownerKey,
        status: 200,
        mimeType: previewMimeType(
          fileName(filePath),
          headerValue(response.headers, 'content-type'),
        ),
        base64Chunks,
      })
    } catch (error) {
      const status = controller.signal.aborted
        ? 504
        : error instanceof Error && error.message === 'FILE_TOO_LARGE'
          ? 413
          : 502
      await native
        .respond({
          requestId,
          ownerKey: session.ownerKey,
          status,
          mimeType: 'text/plain',
          base64Chunks: [],
        })
        .catch(() => undefined)
    } finally {
      clearTimeout(timer)
    }
  }

  const listen = () => {
    listening ??= native.addListener('request', (request) => {
      void serve(request).catch(() => undefined)
    })
    return listening
  }

  return {
    async open(
      api: Pick<AlmaApi, 'tunnel'>,
      entryPath: string,
    ): Promise<HtmlPreviewSession> {
      await listen()
      const root = previewRootDirectory(entryPath)
      const { token, ownerKey } = await native.openSession({ rootPath: root })
      const origin = nativePreviewOrigin(token)
      const entryName = fileName(entryPath)
      live.set(token, { api, root, entryName, ownerKey })
      let closed = false
      return {
        url: `${origin}/${encodeURIComponent(entryName)}`,
        async close() {
          if (closed) return
          closed = true
          live.delete(token)
          await native.closeSession({ token, ownerKey })
        },
      }
    },
  }
}

let nativeSessions: ReturnType<typeof createHtmlPreviewSessions> | undefined

/** The Android isolated preview host; undefined on the web and PWA. */
export function nativeHtmlPreviewSessions() {
  if (!isAndroidNative()) return undefined
  nativeSessions ??= createHtmlPreviewSessions(
    registerPlugin<HtmlPreviewNative>('HtmlPreview'),
  )
  return nativeSessions
}
