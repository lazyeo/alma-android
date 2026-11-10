import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isAndroidNative } from '../nativeRuntime'
import type { NativeHttpSpec } from './openaiCompat'
import type { NativeRequestSpec } from './sonioxAsync'

export type MicPermission = 'granted' | 'denied' | 'prompt'

export interface KeyStatus {
  set: boolean
  /** Last four characters, so the user can tell which key is saved. */
  last4?: string
}

/**
 * Error codes native rejects with (`error.code` in JS):
 * key_missing, host_not_allowed, mic_denied, busy, no_recording,
 * network, timeout, io.
 */
export interface SpeechPlugin {
  checkMicPermission(): Promise<{ mic: MicPermission }>
  requestMicPermission(): Promise<{ mic: MicPermission }>

  /**
   * Saves the key bound to each URL's scheme, host and port. Write-only.
   * `engineId` here and below is the key id (keyIdOf). Native allows more
   * than one URL only for the shared Soniox key and its two fixed hosts.
   */
  setKey(options: {
    engineId: string
    key: string
    boundUrls: string[]
  }): Promise<void>
  keyStatus(options: { engineId: string }): Promise<KeyStatus>
  deleteKey(options: { engineId: string }): Promise<void>

  /** Batch: records 16 kHz mono s16le in memory (hard cap 5 min). */
  startRecording(): Promise<void>
  /** Stops the batch recorder (or one a failed stream handed over). */
  stopRecording(): Promise<{ durationMs: number }>
  /**
   * Stops any recorder and discards the dictation's audio, batch or
   * stream. Audio otherwise stays in memory so a fallback engine can use it.
   */
  cancelRecording(): Promise<void>
  /** Uploads the current audio as WAV with the bound key; keeps the audio. */
  transcribe(spec: NativeHttpSpec): Promise<{ status: number; body: string }>
  /**
   * A JSON call to the bound host with the key (Soniox async's job, status,
   * transcript and delete calls). Needs no recording.
   */
  request(spec: NativeRequestSpec): Promise<{ status: number; body: string }>

  /**
   * Real-time: opens the socket with the bound key, sends `config` (JSON,
   * without api_key; native adds it) as the first frame, then streams 100 ms
   * PCM frames from the recorder, also keeping them in memory. Resolves once
   * the socket is open. If the socket fails while recording, the recorder
   * carries on as a batch recording (stopRecording ends it).
   */
  startStream(options: {
    engineId: string
    url: string
    config: string
  }): Promise<void>
  /** Stops the recorder and sends the empty end-of-audio frame. */
  stopStream(): Promise<void>
  /**
   * Closes the socket without waiting. `keepAudio` keeps the mic recording
   * into memory as a batch recording, for a fallback engine.
   */
  cancelStream(options?: { keepAudio?: boolean }): Promise<void>

  addListener(
    eventName: 'level',
    listener: (event: { rms: number }) => void,
  ): Promise<PluginListenerHandle>
  /** A server text message, forwarded verbatim for JS to parse. */
  addListener(
    eventName: 'streamMessage',
    listener: (event: { data: string }) => void,
  ): Promise<PluginListenerHandle>
  /** The socket ended; `error` is set when it failed rather than closed. */
  addListener(
    eventName: 'streamClosed',
    listener: (event: { code: number; reason: string; error?: string }) => void,
  ): Promise<PluginListenerHandle>
  /** The recorder stopped on its own (5 min cap or a mic failure). */
  addListener(
    eventName: 'recordingStopped',
    listener: (event: { reason: 'limit' | 'error' }) => void,
  ): Promise<PluginListenerHandle>
}

export const Speech = registerPlugin<SpeechPlugin>('Speech')

/** Voice input needs the native recorder; the web build has none. */
export function speechAvailable(): boolean {
  return isAndroidNative()
}
