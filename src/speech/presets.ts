import type { EngineConfig } from './types'

export const SONIOX_RT_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'
/** Soniox async REST API (see sonioxAsync.ts). */
export const SONIOX_API_URL = 'https://api.soniox.com/v1'
/**
 * One Soniox key serves real-time and async, bound to exactly these two
 * hosts. Native accepts a two-host binding only for this id and this pair
 * (SpeechHostRules), so it cannot be widened from JS.
 */
export const SONIOX_KEY_ID = 'soniox'
const SONIOX_KEY_URLS = [SONIOX_RT_URL, SONIOX_API_URL] as const

/**
 * Order follows the Phase 0 bench (docs/plans/2026-10-30-voice-input.md):
 * Soniox real-time with terms is the default, OpenAI gpt-transcribe with a
 * term prompt the fallback. Soniox async transcribes after the recording
 * ends, for when a live socket is not wanted.
 */
export const PRESETS: readonly EngineConfig[] = [
  {
    id: 'soniox-rt',
    kind: 'soniox-rt',
    label: 'Soniox',
    baseUrl: SONIOX_RT_URL,
    model: 'stt-rt-v6',
    models: ['stt-rt-v6'],
    keyId: SONIOX_KEY_ID,
    keyUrls: SONIOX_KEY_URLS,
  },
  {
    id: 'soniox-async',
    kind: 'soniox-async',
    label: 'Soniox Async',
    baseUrl: SONIOX_API_URL,
    model: 'stt-async-v6',
    models: ['stt-async-v6'],
    keyId: SONIOX_KEY_ID,
    keyUrls: SONIOX_KEY_URLS,
  },
  {
    id: 'openai',
    kind: 'openai-compat',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-transcribe',
    models: ['gpt-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'],
  },
  {
    id: 'groq',
    kind: 'openai-compat',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'whisper-large-v3-turbo',
    models: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  },
  {
    id: 'siliconflow',
    kind: 'openai-compat',
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/SenseVoiceSmall',
    models: ['FunAudioLLM/SenseVoiceSmall'],
  },
  {
    id: 'custom',
    kind: 'openai-compat',
    label: 'Custom',
    baseUrl: '',
    model: '',
    models: [],
    custom: true,
  },
]

export const DEFAULT_ENGINE_ID = PRESETS[0].id

/** The native key id an engine's key is saved and resolved under. */
export function keyIdOf(engine: EngineConfig): string {
  return engine.keyId ?? engine.id
}

/** The URLs a newly saved key is bound to. */
export function keyUrlsOf(engine: EngineConfig): string[] {
  return [...(engine.keyUrls ?? [engine.baseUrl])]
}

export function presetById(id: string): EngineConfig | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

/**
 * Base URLs the key may be bound to: https, or wss for streaming. No plain
 * http even on the LAN, because the app's network security config blocks
 * cleartext. Native enforces the same rule again (SpeechHostRules).
 */
export function validBaseUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.username || url.password || url.search || url.hash) return false
  return url.protocol === 'https:' || url.protocol === 'wss:'
}
