// Non-secret voice settings in localStorage. API keys never come here: they
// go straight to the native key store (see nativeSpeech.ts).
import { presetById, PRESETS } from './presets'
import { DEFAULT_TERMS, MAX_TERMS } from './terms'
import type { EngineConfig } from './types'

export const SPEECH_SETTINGS_KEY = 'alma.speech.v1'
const CHANGE_EVENT = 'alma-speech-settings'

/** What releasing the mic does with the result. */
export type ReleaseAction = 'send' | 'insert'
/** The composers with a mic, each with its own release setting. */
export type DictationSurface = 'alma' | 'herdr'

/**
 * Phase 0 order: Soniox real-time first, OpenAI gpt-transcribe as the
 * first fallback, then the rest. Engines without a key are skipped when a
 * dictation starts, so listing them costs nothing.
 */
export const DEFAULT_ENGINE_ORDER: readonly string[] = [
  'soniox-rt',
  'openai',
  ...PRESETS.map((preset) => preset.id).filter(
    (id) => id !== 'soniox-rt' && id !== 'openai',
  ),
]

export interface SpeechSettings {
  /** Every preset id, primary first; later enabled ones are fallbacks. */
  order: string[]
  /** Preset ids switched off in the engine list. */
  disabled: string[]
  /** Chosen model per preset id, when it differs from the preset default. */
  models: Record<string, string>
  custom: { baseUrl: string; model: string }
  terms: string[]
  release: Record<DictationSurface, ReleaseAction>
}

export function defaultSpeechSettings(): SpeechSettings {
  return {
    order: [...DEFAULT_ENGINE_ORDER],
    disabled: [],
    models: {},
    custom: { baseUrl: '', model: '' },
    terms: [...DEFAULT_TERMS],
    release: { alma: 'send', herdr: 'insert' },
  }
}

/** Known ids once each, in the saved order, with new presets appended. */
function normaliseOrder(saved: readonly string[]): string[] {
  const order = saved.filter(
    (id, index) => presetById(id) && saved.indexOf(id) === index,
  )
  for (const id of DEFAULT_ENGINE_ORDER) if (!order.includes(id)) order.push(id)
  return order
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
  let value: Partial<SpeechSettings> & { engineId?: unknown }
  try {
    value = JSON.parse(raw) as typeof value
  } catch {
    return fallback
  }
  if (!value || typeof value !== 'object') return fallback
  const strings = (input: unknown) =>
    Array.isArray(input)
      ? input.filter((item): item is string => typeof item === 'string')
      : undefined
  const models: Record<string, string> = {}
  if (value.models && typeof value.models === 'object')
    for (const [id, model] of Object.entries(value.models))
      if (typeof model === 'string') models[id] = model
  // Settings saved before the engine list had a single chosen engine.
  const legacyFirst = typeof value.engineId === 'string' ? [value.engineId] : []
  const order = normaliseOrder([
    ...(strings(value.order) ?? legacyFirst),
    ...fallback.order,
  ])
  const action = (input: unknown, fallbackAction: ReleaseAction) =>
    input === 'send' || input === 'insert' ? input : fallbackAction
  const release = value.release as
    Partial<SpeechSettings['release']> | undefined
  return {
    order,
    disabled: (strings(value.disabled) ?? []).filter((id) => presetById(id)),
    models,
    custom: {
      baseUrl:
        typeof value.custom?.baseUrl === 'string' ? value.custom.baseUrl : '',
      model: typeof value.custom?.model === 'string' ? value.custom.model : '',
    },
    terms: (strings(value.terms) ?? fallback.terms).slice(0, MAX_TERMS),
    release: {
      alma: action(release?.alma, fallback.release.alma),
      herdr: action(release?.herdr, fallback.release.herdr),
    },
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
  id = primaryEngineId(settings),
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

export function engineEnabled(settings: SpeechSettings, id: string): boolean {
  return !settings.disabled.includes(id)
}

/** The first enabled engine, which the settings rows and the sheet name. */
export function primaryEngineId(settings: SpeechSettings): string {
  return (
    normaliseOrder(settings.order).find((id) => engineEnabled(settings, id)) ??
    DEFAULT_ENGINE_ORDER[0]
  )
}

/**
 * Enabled, usable engines in the user's order: the primary, then the
 * fallbacks. Keys are checked when a dictation starts (natively).
 */
export function engineChain(settings: SpeechSettings): EngineConfig[] {
  return normaliseOrder(settings.order)
    .filter((id) => engineEnabled(settings, id))
    .map((id) => resolveEngine(settings, id))
    .filter(engineReady)
}

/** Moves one engine to `to` in the order (drag or keyboard). */
export function moveEngine(
  settings: SpeechSettings,
  id: string,
  to: number,
): SpeechSettings {
  const order = normaliseOrder(settings.order).filter((item) => item !== id)
  order.splice(Math.max(0, Math.min(order.length, to)), 0, id)
  return { ...settings, order }
}

/** Switches an engine on or off; the last enabled engine stays on. */
export function setEngineEnabled(
  settings: SpeechSettings,
  id: string,
  enabled: boolean,
): SpeechSettings {
  const disabled = settings.disabled.filter((item) => item !== id)
  if (!enabled) {
    const stillOn = normaliseOrder(settings.order).filter(
      (item) => item !== id && !disabled.includes(item),
    )
    if (!stillOn.length) return settings
    disabled.push(id)
  }
  return { ...settings, disabled }
}
