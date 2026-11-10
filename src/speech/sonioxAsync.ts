import type { SpeechPlugin } from './nativeSpeech'
import { keyIdOf } from './presets'
import {
  httpErrorKind,
  type NativeHttpSpec,
  type TranscriptionOutcome,
} from './openaiCompat'
import type { DictationError, EngineConfig } from './types'

// Soniox async REST API (https://api.soniox.com/v1): upload the recording,
// create a transcription for it, poll until it completes, fetch the text,
// then delete both so no audio or transcript stays on the provider.

export const POLL_INTERVAL_MS = 1000
/** About two minutes, matching the batch upload timeout in native. */
export const MAX_POLLS = 120

/** A JSON call native makes with the bound key (see nativeSpeech.ts). */
export interface NativeRequestSpec {
  engineId: string
  method: 'GET' | 'POST' | 'DELETE'
  url: string
  /** JSON body for POST. */
  body?: string
}

const root = (engine: EngineConfig) => engine.baseUrl.trim().replace(/\/+$/, '')

export function sonioxUploadSpec(engine: EngineConfig): NativeHttpSpec {
  return {
    engineId: keyIdOf(engine),
    url: `${root(engine)}/files`,
    fields: {},
    fileField: 'file',
  }
}

export function sonioxCreateSpec(
  engine: EngineConfig,
  terms: readonly string[],
  fileId: string,
): NativeRequestSpec {
  return {
    engineId: keyIdOf(engine),
    method: 'POST',
    url: `${root(engine)}/transcriptions`,
    body: JSON.stringify({
      model: engine.model,
      file_id: fileId,
      language_hints: ['zh', 'en'],
      ...(terms.length ? { context: { terms: [...terms] } } : {}),
    }),
  }
}

export function sonioxStatusSpec(
  engine: EngineConfig,
  id: string,
): NativeRequestSpec {
  return {
    engineId: keyIdOf(engine),
    method: 'GET',
    url: `${root(engine)}/transcriptions/${encodeURIComponent(id)}`,
  }
}

export function sonioxTranscriptSpec(
  engine: EngineConfig,
  id: string,
): NativeRequestSpec {
  return {
    engineId: keyIdOf(engine),
    method: 'GET',
    url: `${root(engine)}/transcriptions/${encodeURIComponent(id)}/transcript`,
  }
}

export function sonioxDeleteSpec(
  engine: EngineConfig,
  what: 'files' | 'transcriptions',
  id: string,
): NativeRequestSpec {
  return {
    engineId: keyIdOf(engine),
    method: 'DELETE',
    url: `${root(engine)}/${what}/${encodeURIComponent(id)}`,
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: DictationError }

function parseJson(
  status: number,
  body: string,
): Parsed<Record<string, unknown>> {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = undefined
  }
  const object =
    json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : undefined
  if (status < 200 || status >= 300) {
    const message =
      typeof object?.message === 'string'
        ? object.message
        : typeof object?.error_message === 'string'
          ? object.error_message
          : ''
    return {
      ok: false,
      error: {
        kind: httpErrorKind(status),
        detail: message
          ? `HTTP ${status}: ${message.slice(0, 200)}`
          : `HTTP ${status}`,
      },
    }
  }
  return object
    ? { ok: true, value: object }
    : { ok: false, error: { kind: 'server', detail: 'bad response' } }
}

/** The `id` of an uploaded file or a created transcription. */
export function parseSonioxId(status: number, body: string): Parsed<string> {
  const parsed = parseJson(status, body)
  if (!parsed.ok) return parsed
  const id = parsed.value.id
  return typeof id === 'string' && id
    ? { ok: true, value: id }
    : { ok: false, error: { kind: 'server', detail: 'no id' } }
}

export function parseSonioxStatus(
  status: number,
  body: string,
): Parsed<'pending' | 'completed'> {
  const parsed = parseJson(status, body)
  if (!parsed.ok) return parsed
  const state = parsed.value.status
  if (state === 'completed') return { ok: true, value: 'completed' }
  if (state === 'queued' || state === 'processing')
    return { ok: true, value: 'pending' }
  const message = parsed.value.error_message
  return {
    ok: false,
    error: {
      kind: 'server',
      detail:
        typeof message === 'string' && message
          ? message.slice(0, 200)
          : String(state),
    },
  }
}

export function parseSonioxTranscript(
  status: number,
  body: string,
): TranscriptionOutcome {
  const parsed = parseJson(status, body)
  if (!parsed.ok) return parsed
  let text = parsed.value.text
  if (typeof text !== 'string' && Array.isArray(parsed.value.tokens))
    text = parsed.value.tokens
      .map((token: unknown) =>
        token && typeof token === 'object' && 'text' in token
          ? String((token as { text: unknown }).text)
          : '',
      )
      .filter((piece) => !piece.startsWith('<'))
      .join('')
  if (typeof text !== 'string')
    return { ok: false, error: { kind: 'server', detail: 'no text' } }
  const trimmed = text.trim()
  return trimmed
    ? { ok: true, text: trimmed }
    : { ok: false, error: { kind: 'empty' } }
}

export interface SonioxAsyncDeps {
  speech: Pick<SpeechPlugin, 'transcribe' | 'request'>
  sleep(ms: number): Promise<void>
  /** False once the dictation was cancelled; polling stops at once. */
  live(): boolean
}

const cancelled: TranscriptionOutcome = {
  ok: false,
  error: { kind: 'unknown', detail: 'cancelled' },
}

/**
 * Runs the whole async job on the last recording. Native rejections
 * propagate to the caller, which maps them like any other native error.
 */
export async function transcribeSonioxAsync(
  engine: EngineConfig,
  terms: readonly string[],
  { speech, sleep, live }: SonioxAsyncDeps,
): Promise<TranscriptionOutcome> {
  const upload = await speech.transcribe(sonioxUploadSpec(engine))
  const file = parseSonioxId(upload.status, upload.body)
  if (!file.ok) return file
  let transcriptionId: string | undefined
  try {
    if (!live()) return cancelled
    const created = await speech.request(
      sonioxCreateSpec(engine, terms, file.value),
    )
    const job = parseSonioxId(created.status, created.body)
    if (!job.ok) return job
    transcriptionId = job.value
    for (let poll = 0; ; poll++) {
      if (!live()) return cancelled
      const reply = await speech.request(sonioxStatusSpec(engine, job.value))
      const state = parseSonioxStatus(reply.status, reply.body)
      if (!state.ok) return state
      if (state.value === 'completed') break
      if (poll + 1 >= MAX_POLLS)
        return { ok: false, error: { kind: 'timeout' } }
      await sleep(POLL_INTERVAL_MS)
    }
    if (!live()) return cancelled
    const transcript = await speech.request(
      sonioxTranscriptSpec(engine, job.value),
    )
    return parseSonioxTranscript(transcript.status, transcript.body)
  } finally {
    void cleanUp(engine, speech, file.value, transcriptionId)
  }
}

/**
 * Best effort and in the background: the user's result does not depend on
 * it, and a failed delete leaves only what Soniox's own retention removes.
 */
async function cleanUp(
  engine: EngineConfig,
  speech: SonioxAsyncDeps['speech'],
  fileId: string,
  transcriptionId?: string,
) {
  // The transcription first: Soniox keeps a file that a job still uses.
  if (transcriptionId)
    await speech
      .request(sonioxDeleteSpec(engine, 'transcriptions', transcriptionId))
      .catch(() => undefined)
  await speech
    .request(sonioxDeleteSpec(engine, 'files', fileId))
    .catch(() => undefined)
}
