import { keyIdOf } from './presets'
import { buildTermsPrompt } from './terms'
import type { DictationError, EngineConfig } from './types'

/**
 * A batch upload the native plugin performs with the last recording. Native
 * adds `Authorization: Bearer <key>` itself after checking the URL's host
 * against the one the key was bound to; the WebView never sees the key.
 */
export interface NativeHttpSpec {
  engineId: string
  url: string
  /** Multipart text fields; the recorded WAV goes into `fileField`. */
  fields: Record<string, string>
  fileField: 'file'
}

export function transcriptionUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/audio/transcriptions`
}

export function buildTranscriptionRequest(
  engine: EngineConfig,
  terms: readonly string[],
): NativeHttpSpec {
  return {
    engineId: keyIdOf(engine),
    url: transcriptionUrl(engine.baseUrl),
    fields: {
      model: engine.model,
      response_format: 'json',
      prompt: buildTermsPrompt(terms),
    },
    fileField: 'file',
  }
}

export type TranscriptionOutcome =
  { ok: true; text: string } | { ok: false; error: DictationError }

/** Maps the provider's HTTP response to text or a classified error. */
export function parseTranscription(
  status: number,
  body: string,
): TranscriptionOutcome {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = undefined
  }
  if (status < 200 || status >= 300)
    return {
      ok: false,
      error: { kind: httpErrorKind(status), detail: errorDetail(status, json) },
    }
  const text =
    json && typeof json === 'object' && 'text' in json
      ? (json as { text: unknown }).text
      : undefined
  if (typeof text !== 'string')
    return { ok: false, error: { kind: 'server', detail: 'no text' } }
  const trimmed = text.trim()
  return trimmed
    ? { ok: true, text: trimmed }
    : { ok: false, error: { kind: 'empty' } }
}

export function httpErrorKind(status: number): DictationError['kind'] {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402 || status === 429) return 'rate_limited'
  if (status === 408 || status === 504) return 'timeout'
  if (status >= 500) return 'server'
  if (status >= 400) return 'bad_request'
  return 'unknown'
}

function errorDetail(status: number, json: unknown): string {
  const error =
    json && typeof json === 'object' && 'error' in json
      ? (json as { error: unknown }).error
      : undefined
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  return message ? `HTTP ${status}: ${message.slice(0, 200)}` : `HTTP ${status}`
}
