import type { PluginListenerHandle } from '@capacitor/core'
import type { SpeechPlugin } from './nativeSpeech'
import { buildTranscriptionRequest, parseTranscription } from './openaiCompat'
import {
  applySonioxTokens,
  buildSonioxConfig,
  EMPTY_TRANSCRIPT,
  parseSonioxMessage,
  transcriptText,
  type SonioxTranscript,
} from './soniox'
import { keyIdOf } from './presets'
import { transcribeSonioxAsync } from './sonioxAsync'
import type { DictationError, EngineConfig } from './types'

/** How long Stop waits for Soniox's `finished` before giving up. */
export const FINISH_TIMEOUT_MS = 5000
/** Shorter batch clips are almost always an accidental tap. */
export const MIN_BATCH_MS = 300

export type DictationState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | {
      phase: 'recording'
      startedAt: number
      level: number
      transcript: SonioxTranscript
    }
  | { phase: 'finishing'; transcript: SonioxTranscript }
  | { phase: 'done'; text: string }
  | {
      phase: 'error'
      error: DictationError
      /** What was already recognised, so the user can still keep it. */
      partial: string
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

/**
 * One dictation from Start to an inserted result. Every async step checks
 * its generation, so Cancel (or a new Start) makes late native results inert.
 */
export class DictationSession {
  private state: DictationState = { phase: 'idle' }
  private generation = 0
  private handles: Promise<PluginListenerHandle>[] = []
  private finishTimer: unknown
  private settle?: () => void
  private engine?: EngineConfig
  private terms: readonly string[] = []

  constructor(
    private readonly deps: SessionDeps,
    private readonly emit: (state: DictationState) => void,
  ) {}

  get current(): DictationState {
    return this.state
  }

  async start(engine: EngineConfig, terms: readonly string[]): Promise<void> {
    if (this.state.phase === 'starting' || this.state.phase === 'recording')
      return
    if (this.state.phase === 'finishing') return
    const generation = ++this.generation
    const live = () => generation === this.generation
    this.engine = engine
    this.terms = terms
    this.set({ phase: 'starting' })
    const { speech } = this.deps
    try {
      let { mic } = await speech.checkMicPermission()
      if (mic !== 'granted') ({ mic } = await speech.requestMicPermission())
      if (!live()) return
      if (mic !== 'granted') return this.fail({ kind: 'mic_denied' })
      const key = await speech.keyStatus({ engineId: keyIdOf(engine) })
      if (!live()) return
      if (!key.set) return this.fail({ kind: 'needs_key' })
      this.listen(engine)
      if (engine.kind === 'soniox-rt') {
        await speech.startStream({
          engineId: keyIdOf(engine),
          url: engine.baseUrl,
          config: JSON.stringify(buildSonioxConfig(engine, terms)),
        })
      } else {
        await speech.startRecording()
      }
      if (!live()) {
        await this.stopNative(engine)
        return
      }
      this.set({
        phase: 'recording',
        startedAt: this.deps.now(),
        level: 0,
        transcript: EMPTY_TRANSCRIPT,
      })
    } catch (error) {
      if (live()) this.fail(nativeError(error))
    }
  }

  async stop(): Promise<void> {
    if (this.state.phase !== 'recording' || !this.engine) return
    const engine = this.engine
    const generation = this.generation
    const live = () => generation === this.generation
    const transcript = this.state.transcript
    this.set({ phase: 'finishing', transcript })
    const { speech } = this.deps
    try {
      if (engine.kind === 'soniox-rt') {
        const finished = new Promise<void>((resolve) => {
          this.settle = resolve
          this.finishTimer = this.deps.setTimeout(resolve, FINISH_TIMEOUT_MS)
        })
        await speech.stopStream()
        await finished
        // Re-read: listeners moved the state on while this call awaited.
        const settled = this.current
        if (!live() || settled.phase !== 'finishing') return
        const { transcript: result } = settled
        if (!result.finished) {
          await speech.cancelStream().catch(() => undefined)
          const text = transcriptText(result)
          return text
            ? this.finish(text)
            : this.fail({ kind: 'timeout' }, result)
        }
        return this.finish(transcriptText(result))
      }
      const { durationMs } = await speech.stopRecording()
      if (!live()) return
      if (durationMs < MIN_BATCH_MS) {
        await speech.cancelRecording().catch(() => undefined)
        return this.fail({ kind: 'empty' })
      }
      const outcome =
        engine.kind === 'soniox-async'
          ? await transcribeSonioxAsync(engine, this.terms, {
              speech,
              live,
              sleep: (ms) =>
                new Promise((resolve) => this.deps.setTimeout(resolve, ms)),
            })
          : await this.transcribeOnce(engine)
      if (!live()) return
      return outcome.ok ? this.finish(outcome.text) : this.fail(outcome.error)
    } catch (error) {
      if (live()) this.fail(nativeError(error))
    }
  }

  private async transcribeOnce(engine: EngineConfig) {
    const response = await this.deps.speech.transcribe(
      buildTranscriptionRequest(engine, this.terms),
    )
    return parseTranscription(response.status, response.body)
  }

  /** Abandons the dictation; nothing is inserted. */
  async cancel(): Promise<void> {
    const engine = this.engine
    this.generation++
    this.release()
    this.set({ phase: 'idle' })
    if (engine) await this.stopNative(engine)
  }

  /** Clears a finished or failed dictation back to idle. */
  reset(): void {
    if (this.state.phase === 'done' || this.state.phase === 'error')
      this.set({ phase: 'idle' })
  }

  dispose(): void {
    void this.cancel()
  }

  private listen(engine: EngineConfig) {
    this.release()
    const generation = this.generation
    const live = () => generation === this.generation
    const { speech } = this.deps
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
    ]
    if (engine.kind !== 'soniox-rt') return
    this.handles.push(
      speech.addListener('streamMessage', ({ data }) => {
        if (!live()) return
        const state = this.state
        if (state.phase !== 'recording' && state.phase !== 'finishing') return
        const message = parseSonioxMessage(data)
        if (message.type === 'error') {
          void speech.cancelStream().catch(() => undefined)
          return this.fail(message.error, state.transcript)
        }
        const transcript = applySonioxTokens(state.transcript, message)
        this.set({ ...state, transcript })
        if (transcript.finished) this.settle?.()
      }),
      speech.addListener('streamClosed', ({ error }) => {
        if (!live()) return
        const state = this.state
        if (state.phase === 'finishing') return this.settle?.()
        if (state.phase === 'recording')
          this.fail(
            error ? { kind: 'network', detail: error } : { kind: 'network' },
            state.transcript,
          )
      }),
    )
  }

  private finish(text: string) {
    this.release()
    if (!text) return this.fail({ kind: 'empty' })
    this.set({ phase: 'done', text })
  }

  private fail(error: DictationError, transcript?: SonioxTranscript) {
    this.release()
    const partial = transcript ? transcriptText(transcript) : ''
    this.set({ phase: 'error', error, partial })
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

  private async stopNative(engine: EngineConfig) {
    const { speech } = this.deps
    const stop =
      engine.kind === 'soniox-rt'
        ? speech.cancelStream()
        : speech.cancelRecording()
    await stop.catch(() => undefined)
  }

  private set(state: DictationState) {
    this.state = state
    this.emit(state)
  }
}
