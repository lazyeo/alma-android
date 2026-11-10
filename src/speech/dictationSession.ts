import type { PluginListenerHandle } from '@capacitor/core'
import type { SpeechPlugin } from './nativeSpeech'
import {
  buildTranscriptionRequest,
  parseTranscription,
  type TranscriptionOutcome,
} from './openaiCompat'
import { keyIdOf } from './presets'
import {
  applySonioxTokens,
  buildSonioxConfig,
  EMPTY_TRANSCRIPT,
  parseSonioxMessage,
  transcriptText,
  type SonioxTranscript,
} from './soniox'
import { transcribeSonioxAsync } from './sonioxAsync'
import type { DictationError, DictationErrorKind, EngineConfig } from './types'

/** How long Stop waits for Soniox's `finished` before giving up. */
export const FINISH_TIMEOUT_MS = 5000
/** Shorter batch clips are almost always an accidental tap. */
export const MIN_BATCH_MS = 300

/**
 * Failures the next engine may not share. Others (a refused request, a
 * missing key, the mic, the user cancelling) would fail the same way or
 * are not failures of the engine at all.
 */
export const FALLBACK_KINDS = [
  'network',
  'auth',
  'timeout',
  'server',
  'empty',
] as const
export type FallbackKind = (typeof FALLBACK_KINDS)[number]

function isFallbackKind(kind: DictationErrorKind): kind is FallbackKind {
  return (FALLBACK_KINDS as readonly string[]).includes(kind)
}

/** The last engine switch, for the sheet's "X failed, now using Y" line. */
export interface FallbackNote {
  from: EngineConfig
  to: EngineConfig
  reason: FallbackKind
}

export type DictationState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | {
      phase: 'recording'
      /** The engine that will produce the result. */
      engine: EngineConfig
      startedAt: number
      level: number
      transcript: SonioxTranscript
      fallback?: FallbackNote
    }
  | {
      phase: 'finishing'
      engine: EngineConfig
      transcript: SonioxTranscript
      fallback?: FallbackNote
    }
  | {
      phase: 'done'
      engine: EngineConfig
      text: string
      fallback?: FallbackNote
    }
  | {
      phase: 'error'
      engine?: EngineConfig
      error: DictationError
      /** What was already recognised, so the user can still keep it. */
      partial: string
      fallback?: FallbackNote
    }

export interface SessionDeps {
  speech: SpeechPlugin
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/** Native rejections carry a code (see nativeSpeech.ts). */
export function nativeError(error: unknown): DictationError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).slice(0, 200)
      : undefined
  const kinds: Record<string, DictationError['kind']> = {
    key_missing: 'needs_key',
    host_not_allowed: 'host_not_allowed',
    mic_denied: 'mic_denied',
    busy: 'busy',
    no_recording: 'empty',
    network: 'network',
    timeout: 'timeout',
  }
  const kind = kinds[code] ?? 'unknown'
  return kind === 'unknown' && message ? { kind, detail: message } : { kind }
}

const realtime = (engine: EngineConfig) => engine.kind === 'soniox-rt'

/**
 * One dictation from Start to a result, across the user's engine chain:
 * the first engine with a key records, and on a FALLBACK_KINDS failure the
 * next batch engine transcribes the same in-memory audio. Every async step
 * checks its generation, so Cancel (or a new Start) makes late native
 * results inert.
 */
export class DictationSession {
  private state: DictationState = { phase: 'idle' }
  private generation = 0
  private handles: Promise<PluginListenerHandle>[] = []
  private finishTimer: unknown
  private settle?: () => void
  /** Engines with a key, in the user's order. */
  private engines: EngineConfig[] = []
  private active?: EngineConfig
  private fallback?: FallbackNote
  /** Why the stream ended while finishing, when it failed. */
  private streamError?: DictationError
  private terms: readonly string[] = []

  constructor(
    private readonly deps: SessionDeps,
    private readonly emit: (state: DictationState) => void,
  ) {}

  get current(): DictationState {
    return this.state
  }

  async start(
    chain: readonly EngineConfig[],
    terms: readonly string[],
  ): Promise<void> {
    if (
      this.state.phase === 'starting' ||
      this.state.phase === 'recording' ||
      this.state.phase === 'finishing'
    )
      return
    const generation = ++this.generation
    const live = () => generation === this.generation
    this.engines = []
    this.active = chain[0]
    this.fallback = undefined
    this.streamError = undefined
    this.terms = terms
    this.set({ phase: 'starting' })
    const { speech } = this.deps
    try {
      let { mic } = await speech.checkMicPermission()
      if (mic !== 'granted') ({ mic } = await speech.requestMicPermission())
      if (!live()) return
      if (mic !== 'granted') return this.fail({ kind: 'mic_denied' })
      const keyed = new Map<string, boolean>()
      for (const engine of chain) {
        const keyId = keyIdOf(engine)
        if (!keyed.has(keyId))
          keyed.set(keyId, (await speech.keyStatus({ engineId: keyId })).set)
        if (!live()) return
        if (keyed.get(keyId)) this.engines.push(engine)
      }
      const engine = this.engines[0]
      if (!engine) return this.fail({ kind: 'needs_key' })
      this.active = engine
      this.listen()
      if (realtime(engine)) {
        await speech.startStream({
          engineId: keyIdOf(engine),
          url: engine.baseUrl,
          config: JSON.stringify(buildSonioxConfig(engine, terms)),
        })
      } else {
        await speech.startRecording()
      }
      if (!live()) {
        await this.discardNative()
        return
      }
      this.set({
        phase: 'recording',
        engine,
        startedAt: this.deps.now(),
        level: 0,
        transcript: EMPTY_TRANSCRIPT,
      })
    } catch (error) {
      if (live()) this.fail(nativeError(error))
    }
  }

  async stop(): Promise<void> {
    if (this.state.phase !== 'recording' || !this.active) return
    const engine = this.active
    const generation = this.generation
    const live = () => generation === this.generation
    const transcript = this.state.transcript
    this.set({
      phase: 'finishing',
      engine,
      transcript,
      fallback: this.fallback,
    })
    const { speech } = this.deps
    try {
      if (realtime(engine)) {
        const finished = new Promise<void>((resolve) => {
          this.settle = resolve
          this.finishTimer = this.deps.setTimeout(resolve, FINISH_TIMEOUT_MS)
        })
        await speech.stopStream()
        await finished
        // Re-read: listeners moved the state on while this call awaited.
        const settled = this.current
        if (!live() || settled.phase !== 'finishing') return
        const result = settled.transcript
        const text = transcriptText(result)
        if (result.finished && text) return this.finish(text)
        const failure: DictationError =
          this.streamError ??
          (result.finished ? { kind: 'empty' } : { kind: 'timeout' })
        const next = this.nextEngine(failure.kind)
        if (!next) {
          // Without a fallback, what was heard beats an error.
          if (failure.kind === 'timeout' && text) return this.finish(text)
          return this.fail(failure, text)
        }
        // The recorder already stopped; the whole dictation is in memory.
        await speech.cancelStream().catch(() => undefined)
        if (!live()) return
        this.switchTo(next, failure.kind, result)
        return this.transcribeFrom(next, text, live)
      }
      const { durationMs } = await speech.stopRecording()
      if (!live()) return
      if (durationMs < MIN_BATCH_MS) return this.fail({ kind: 'empty' })
      return this.transcribeFrom(engine, transcriptText(transcript), live)
    } catch (error) {
      if (live()) this.fail(nativeError(error), transcriptText(transcript))
    }
  }

  /** Abandons the dictation; nothing is inserted. */
  async cancel(): Promise<void> {
    this.generation++
    this.release()
    const wasActive = this.state.phase !== 'idle'
    this.set({ phase: 'idle' })
    if (wasActive) await this.discardNative()
  }

  /** Clears a finished or failed dictation back to idle. */
  reset(): void {
    if (this.state.phase === 'done' || this.state.phase === 'error')
      this.set({ phase: 'idle' })
  }

  dispose(): void {
    void this.cancel()
  }

  /** Batch engines from `engine` on, until one returns text. */
  private async transcribeFrom(
    first: EngineConfig,
    partial: string,
    live: () => boolean,
  ) {
    let engine = first
    for (;;) {
      let outcome: TranscriptionOutcome
      try {
        outcome = await this.transcribeOnce(engine, live)
      } catch (error) {
        outcome = { ok: false, error: nativeError(error) }
      }
      if (!live()) return
      if (outcome.ok) return this.finish(outcome.text)
      const next = this.nextEngine(outcome.error.kind)
      if (!next) return this.fail(outcome.error, partial)
      this.switchTo(next, outcome.error.kind)
      engine = next
    }
  }

  private transcribeOnce(engine: EngineConfig, live: () => boolean) {
    const { speech } = this.deps
    if (engine.kind === 'soniox-async')
      return transcribeSonioxAsync(engine, this.terms, {
        speech,
        live,
        sleep: (ms) =>
          new Promise<void>((resolve) => this.deps.setTimeout(resolve, ms)),
      })
    return speech
      .transcribe(buildTranscriptionRequest(engine, this.terms))
      .then((response) => parseTranscription(response.status, response.body))
  }

  /** The next batch engine after the active one, if `kind` warrants one. */
  private nextEngine(kind: DictationErrorKind): EngineConfig | undefined {
    if (!isFallbackKind(kind) || !this.active) return undefined
    const from = this.engines.indexOf(this.active)
    return this.engines.slice(from + 1).find((engine) => !realtime(engine))
  }

  private switchTo(
    next: EngineConfig,
    reason: DictationErrorKind,
    transcript?: SonioxTranscript,
  ) {
    // nextEngine only offers an engine for a fallback kind.
    if (!isFallbackKind(reason)) return
    const from = this.active!
    this.active = next
    this.fallback = { from, to: next, reason }
    const state = this.state
    if (state.phase === 'recording')
      this.set({ ...state, engine: next, fallback: this.fallback })
    else
      this.set({
        phase: 'finishing',
        engine: next,
        transcript:
          transcript ??
          (state.phase === 'finishing' ? state.transcript : EMPTY_TRANSCRIPT),
        fallback: this.fallback,
      })
  }

  /** The stream failed mid-dictation: carry on recording for a fallback. */
  private streamFailed(error: DictationError) {
    const state = this.state
    if (state.phase === 'finishing') {
      this.streamError = error
      return this.settle?.()
    }
    if (state.phase !== 'recording') return
    const next = this.nextEngine(error.kind)
    if (!next) {
      this.fail(error, transcriptText(state.transcript))
      return
    }
    // Native keeps the recorder running into memory (a closed socket
    // already handed it over; this covers an error message on an open one).
    void this.deps.speech
      .cancelStream({ keepAudio: true })
      .catch(() => undefined)
    this.switchTo(next, error.kind)
  }

  private listen() {
    this.release()
    const generation = this.generation
    const live = () => generation === this.generation
    const { speech } = this.deps
    const streaming = () => Boolean(this.active && realtime(this.active))
    this.handles = [
      speech.addListener('level', ({ rms }) => {
        if (live() && this.state.phase === 'recording')
          this.set({ ...this.state, level: rms })
      }),
      speech.addListener('recordingStopped', ({ reason }) => {
        if (!live() || this.state.phase !== 'recording') return
        if (reason === 'limit') void this.stop()
        else this.fail({ kind: 'unknown', detail: 'microphone' })
      }),
      speech.addListener('streamMessage', ({ data }) => {
        if (!live() || !streaming()) return
        const state = this.state
        if (state.phase !== 'recording' && state.phase !== 'finishing') return
        const message = parseSonioxMessage(data)
        if (message.type === 'error') return this.streamFailed(message.error)
        const transcript = applySonioxTokens(state.transcript, message)
        this.set({ ...state, transcript })
        if (transcript.finished) this.settle?.()
      }),
      speech.addListener('streamClosed', ({ error }) => {
        if (!live() || !streaming()) return
        const state = this.state
        if (state.phase === 'finishing' && !error) return this.settle?.()
        this.streamFailed(
          error ? { kind: 'network', detail: error } : { kind: 'network' },
        )
      }),
    ]
  }

  private finish(text: string) {
    if (!text) return this.fail({ kind: 'empty' })
    this.release()
    this.set({
      phase: 'done',
      engine: this.active!,
      text,
      fallback: this.fallback,
    })
    void this.discardNative()
  }

  private fail(error: DictationError, partial = '') {
    this.release()
    this.set({
      phase: 'error',
      engine: this.active,
      error,
      partial,
      fallback: this.fallback,
    })
    void this.discardNative()
  }

  private release() {
    if (this.finishTimer !== undefined) this.deps.clearTimeout(this.finishTimer)
    this.finishTimer = undefined
    const settle = this.settle
    this.settle = undefined
    settle?.()
    const handles = this.handles
    this.handles = []
    for (const handle of handles)
      void handle.then((h) => h.remove()).catch(() => undefined)
  }

  /** Closes any socket, stops any recorder and frees the in-memory audio. */
  private async discardNative() {
    const { speech } = this.deps
    await Promise.all([
      speech.cancelStream().catch(() => undefined),
      speech.cancelRecording().catch(() => undefined),
    ])
  }

  private set(state: DictationState) {
    this.state = state
    this.emit(state)
  }
}
