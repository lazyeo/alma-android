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

  /** Saves the key bound to `boundUrl`'s scheme, host and port. Write-only. */
  setKey(options: {
    engineId: string
    key: string
    boundUrl: string
  }): Promise<void>
  keyStatus(options: { engineId: string }): Promise<KeyStatus>
  deleteKey(options: { engineId: string }): Promise<void>

  /** Batch: records 16 kHz mono s16le in memory (hard cap 5 min). */
  startRecording(): Promise<void>
  stopRecording(): Promise<{ durationMs: number }>
  cancelRecording(): Promise<void>
  /** Uploads the last recording as WAV with the bound key, then drops it. */
  transcribe(spec: NativeHttpSpec): Promise<{ status: number; body: string }>
  /**
   * A JSON call to the bound host with the key (Soniox async's job, status,
   * transcript and delete calls). Needs no recording.
   */
  request(spec: NativeRequestSpec): Promise<{ status: number; body: string }>

  /**
   * Real-time: opens the socket with the bound key, sends `config` (JSON,
   * without api_key; native adds it) as the first frame, then streams 100 ms
   * PCM frames from the recorder. Resolves once the socket is open.
   */
  startStream(options: {
    engineId: string
    url: string
    config: string
  }): Promise<void>
  /** Stops the recorder and sends the empty end-of-audio frame. */
  stopStream(): Promise<void>
  /** Stops everything and closes the socket without waiting. */
  cancelStream(): Promise<void>

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
