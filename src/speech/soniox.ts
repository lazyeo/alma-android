import { httpErrorKind } from './openaiCompat'
import type { DictationError, EngineConfig } from './types'

// Soniox real-time protocol (wss://stt-rt.soniox.com/transcribe-websocket):
// first a JSON config frame, then 100 ms binary PCM frames, then an empty
// string to end the audio. The server streams token batches until a message
// with `finished: true`.

export const PCM_SAMPLE_RATE = 16000

/**
 * The first frame, minus `api_key`: native adds the key to this object after
 * the host check, so the key never enters the WebView.
 */
export function buildSonioxConfig(
  engine: EngineConfig,
  terms: readonly string[],
): Record<string, unknown> {
  return {
    model: engine.model,
    audio_format: 'pcm_s16le',
    sample_rate: PCM_SAMPLE_RATE,
    num_channels: 1,
    language_hints: ['zh', 'en'],
    ...(terms.length ? { context: { terms: [...terms] } } : {}),
  }
}

export interface SonioxToken {
  text: string
  isFinal: boolean
}

export type SonioxMessage =
  | { type: 'tokens'; tokens: SonioxToken[]; finished: boolean }
  | { type: 'error'; error: DictationError }

export function parseSonioxMessage(raw: string): SonioxMessage {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { type: 'error', error: { kind: 'server', detail: 'bad message' } }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json))
    return { type: 'error', error: { kind: 'server', detail: 'bad message' } }
  const message = json as {
    tokens?: unknown
    finished?: unknown
    error_code?: unknown
    error_message?: unknown
  }
  if (message.error_code !== undefined || message.error_message !== undefined) {
    const code = Number(message.error_code)
    const text =
      typeof message.error_message === 'string' ? message.error_message : ''
    return {
      type: 'error',
      error: {
        kind: Number.isFinite(code) ? httpErrorKind(code) : 'server',
        detail: [Number.isFinite(code) ? String(code) : '', text]
          .filter(Boolean)
          .join(': ')
          .slice(0, 200),
      },
    }
  }
  const tokens = Array.isArray(message.tokens)
    ? message.tokens.flatMap((token): SonioxToken[] => {
        if (!token || typeof token !== 'object') return []
        const { text, is_final } = token as {
          text?: unknown
          is_final?: unknown
        }
        // `<end>`, `<fin>` and similar are control markers, not speech.
        if (typeof text !== 'string' || text.startsWith('<')) return []
        return [{ text, isFinal: is_final === true }]
      })
    : []
  return { type: 'tokens', tokens, finished: message.finished === true }
}

/** Accumulated transcript: committed text plus the replaceable live tail. */
export interface SonioxTranscript {
  final: string
  tail: string
  finished: boolean
}

export const EMPTY_TRANSCRIPT: SonioxTranscript = {
  final: '',
  tail: '',
  finished: false,
}

/**
 * Final tokens are sent once and append; non-final tokens are re-sent with
 * every message, so each message replaces the whole tail.
 */
export function applySonioxTokens(
  state: SonioxTranscript,
  message: Extract<SonioxMessage, { type: 'tokens' }>,
): SonioxTranscript {
  let final = state.final
  let tail = ''
  for (const token of message.tokens) {
    if (token.isFinal) final += token.text
    else tail += token.text
  }
  return {
    final,
    tail: message.finished ? '' : tail,
    finished: state.finished || message.finished,
  }
}

/** What gets inserted: committed text, plus any tail if the stream ended early. */
export function transcriptText(state: SonioxTranscript): string {
  return (state.final + state.tail).trim()
}
