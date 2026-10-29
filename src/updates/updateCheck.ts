import {
  UPDATE_REPOSITORY,
  parseLatestRelease,
  updateErrorKind,
  type AvailableRelease,
  type UpdateErrorKind,
} from './updateModel'

export const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`
const CHECK_TIMEOUT_MS = 15_000

export class UpdateCheckError extends Error {
  constructor(readonly kind: UpdateErrorKind) {
    super(`Update check failed: ${kind}`)
    this.name = 'UpdateCheckError'
  }
}

/**
 * Fetches the newest stable release. Resolves undefined when nothing stable
 * is published; rejects with an UpdateCheckError carrying the copy kind.
 */
export async function fetchLatestRelease({
  fetch = globalThis.fetch,
  timeoutMs = CHECK_TIMEOUT_MS,
  isOnline = () => navigator.onLine,
}: {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  isOnline?: () => boolean
} = {}): Promise<AvailableRelease | undefined> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const fail = (status?: number) =>
    new UpdateCheckError(
      updateErrorKind({ online: isOnline(), status, timedOut }),
    )
  try {
    let response: Response
    try {
      response = await fetch(LATEST_RELEASE_API, {
        method: 'GET',
        // Anonymous on purpose: no token, cookie or identifying header.
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      })
    } catch {
      throw fail()
    }
    if (response.status === 404) return undefined
    if (!response.ok) throw fail(response.status)
    try {
      return parseLatestRelease(await response.json())
    } catch {
      throw fail()
    }
  } finally {
    clearTimeout(timer)
  }
}
