import type { EngineConfig } from './types'

export const SONIOX_RT_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'

/**
 * Order follows the Phase 0 bench (docs/plans/2026-10-30-voice-input.md):
 * Soniox real-time with terms is the default, OpenAI gpt-transcribe with a
 * term prompt the fallback.
 */
export const PRESETS: readonly EngineConfig[] = [
  {
    id: 'soniox-rt',
    kind: 'soniox-rt',
    label: 'Soniox',
    baseUrl: SONIOX_RT_URL,
    model: 'stt-rt-v6',
    models: ['stt-rt-v6'],
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

export function presetById(id: string): EngineConfig | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

/**
 * Base URLs the key may be bound to: https (wss for streaming), or plain
 * http only to a loopback / private LAN / .local host for a self-hosted
 * server. Native enforces the same rule again (SpeechHostRules).
 */
export function validBaseUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.username || url.password || url.search || url.hash) return false
  if (url.protocol === 'https:' || url.protocol === 'wss:') return true
  return url.protocol === 'http:' && isPrivateHost(url.hostname)
}

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local')) return true
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p > 255))
    return false
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}
