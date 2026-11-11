import { nativeError } from './dictationSession'
import { httpErrorKind } from './openaiCompat'
import { keyIdOf, SONIOX_API_URL } from './presets'
import type { NativeRequestSpec } from './sonioxAsync'
import type { EngineConfig } from './types'

/**
 * What checking a freshly saved key found. `unverified`: the provider
 * answered, but not in a way that says whether the key works (a custom
 * endpoint without a model list, say); the key stays saved either way.
 */
export type KeyCheck =
  | { state: 'checking' }
  | { state: 'ok' }
  | {
      state: 'failed'
      reason: 'auth' | 'quota' | 'network' | 'server' | 'unverified'
      /** e.g. "HTTP 404", shown muted after the reason. */
      detail?: string
    }

/**
 * The cheapest authenticated call per provider: listing models on an
 * OpenAI-compatible API, listing (usually no) files on Soniox, whose model
 * list needs no key. Always a GET to a host the key is bound to, so native
 * refuses it outright if the binding does not match.
 */
export function keyCheckSpec(engine: EngineConfig): NativeRequestSpec {
  const url =
    engine.kind === 'openai-compat'
      ? `${engine.baseUrl.trim().replace(/\/+$/, '')}/models`
      : `${SONIOX_API_URL}/files`
  return { engineId: keyIdOf(engine), method: 'GET', url }
}

export function keyCheckFromStatus(status: number): KeyCheck {
  if (status >= 200 && status < 300) return { state: 'ok' }
  const kind = httpErrorKind(status)
  const detail = `HTTP ${status}`
  if (kind === 'auth') return { state: 'failed', reason: 'auth', detail }
  if (kind === 'rate_limited')
    return { state: 'failed', reason: 'quota', detail }
  if (kind === 'server' || kind === 'timeout')
    return { state: 'failed', reason: 'server', detail }
  return { state: 'failed', reason: 'unverified', detail }
}

export function keyCheckFromError(error: unknown): KeyCheck {
  const { kind } = nativeError(error)
  if (kind === 'network' || kind === 'timeout')
    return { state: 'failed', reason: 'network' }
  if (kind === 'needs_key') return { state: 'failed', reason: 'auth' }
  return { state: 'failed', reason: 'unverified', detail: kind }
}

/** Sends the check through native, which attaches the key. */
export async function checkKey(
  request: (spec: NativeRequestSpec) => Promise<{ status: number }>,
  engine: EngineConfig,
): Promise<KeyCheck> {
  try {
    const { status } = await request(keyCheckSpec(engine))
    return keyCheckFromStatus(status)
  } catch (error) {
    return keyCheckFromError(error)
  }
}
