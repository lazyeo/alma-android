// Non-secret voice settings in localStorage. API keys never come here: they
// go straight to the native key store (see nativeSpeech.ts).
import { DEFAULT_ENGINE_ID, presetById, PRESETS } from './presets'
import { DEFAULT_TERMS, MAX_TERMS } from './terms'
import type { EngineConfig } from './types'

export const SPEECH_SETTINGS_KEY = 'alma.speech.v1'
const CHANGE_EVENT = 'alma-speech-settings'

export interface SpeechSettings {
  engineId: string
  /** Chosen model per preset id, when it differs from the preset default. */
  models: Record<string, string>
  custom: { baseUrl: string; model: string }
  terms: string[]
}

export function defaultSpeechSettings(): SpeechSettings {
  return {
    engineId: DEFAULT_ENGINE_ID,
    models: {},
    custom: { baseUrl: '', model: '' },
    terms: [...DEFAULT_TERMS],
  }
}

export function loadSpeechSettings(): SpeechSettings {
  const fallback = defaultSpeechSettings()
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SPEECH_SETTINGS_KEY)
  } catch {
    return fallback
  }
  if (!raw) return fallback
  let value: Partial<SpeechSettings>
  try {
    value = JSON.parse(raw) as Partial<SpeechSettings>
  } catch {
    return fallback
  }
  const strings = (input: unknown) =>
    Array.isArray(input)
      ? input.filter((item): item is string => typeof item === 'string')
      : undefined
  const models: Record<string, string> = {}
  if (value.models && typeof value.models === 'object')
    for (const [id, model] of Object.entries(value.models))
      if (typeof model === 'string') models[id] = model
  return {
    engineId:
      typeof value.engineId === 'string' && presetById(value.engineId)
        ? value.engineId
        : fallback.engineId,
    models,
    custom: {
      baseUrl:
        typeof value.custom?.baseUrl === 'string' ? value.custom.baseUrl : '',
      model: typeof value.custom?.model === 'string' ? value.custom.model : '',
    },
    terms: (strings(value.terms) ?? fallback.terms).slice(0, MAX_TERMS),
  }
}

/** Throws when storage is unavailable so the caller can show an error. */
export function saveSpeechSettings(settings: SpeechSettings): void {
  localStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(settings))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function onSpeechSettingsChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

/** The engine with the user's model and, for Custom, base URL applied. */
export function resolveEngine(
  settings: SpeechSettings,
  id = settings.engineId,
): EngineConfig {
  const preset = presetById(id) ?? PRESETS[0]
  if (preset.custom)
    return {
      ...preset,
      baseUrl: settings.custom.baseUrl.trim(),
      model: settings.custom.model.trim(),
      models: settings.custom.model.trim()
        ? [settings.custom.model.trim()]
        : [],
    }
  const model = settings.models[preset.id]
  return model && preset.models.includes(model) ? { ...preset, model } : preset
}

/** Custom needs both a base URL and a model before it can be used. */
export function engineReady(engine: EngineConfig): boolean {
  return Boolean(engine.baseUrl && engine.model)
}
