import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpeechSettings,
  engineChain,
  engineReady,
  loadSpeechSettings,
  moveEngine,
  primaryEngineId,
  resolveEngine,
  saveSpeechSettings,
  setEngineEnabled,
  SPEECH_SETTINGS_KEY,
} from './engineStore'
import { DEFAULT_TERMS } from './terms'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('window', new EventTarget())
})

describe('speech settings', () => {
  it('defaults to Soniox, then OpenAI, then the rest, and the generic terms', () => {
    expect(loadSpeechSettings()).toEqual({
      order: [
        'soniox-rt',
        'openai',
        'soniox-async',
        'groq',
        'siliconflow',
        'custom',
      ],
      disabled: [],
      models: {},
      custom: { baseUrl: '', model: '' },
      terms: [...DEFAULT_TERMS],
      release: { alma: 'send', herdr: 'insert' },
    })
  })

  it('moves a legacy chosen engine to the front', () => {
    localStorage.setItem(
      SPEECH_SETTINGS_KEY,
      JSON.stringify({ engineId: 'groq', terms: ['A'] }),
    )
    const settings = loadSpeechSettings()
    expect(settings.order.slice(0, 3)).toEqual(['groq', 'soniox-rt', 'openai'])
    expect(primaryEngineId(settings)).toBe('groq')
  })

  it('keeps the saved order, drops unknown ids and appends new presets', () => {
    localStorage.setItem(
      SPEECH_SETTINGS_KEY,
      JSON.stringify({
        order: ['openai', 'gone', 'openai', 'soniox-rt'],
        disabled: ['gone', 'groq'],
        release: { alma: 'insert', herdr: 'nonsense' },
      }),
    )
    const settings = loadSpeechSettings()
    expect(settings.order).toEqual([
      'openai',
      'soniox-rt',
      'soniox-async',
      'groq',
      'siliconflow',
      'custom',
    ])
    expect(settings.disabled).toEqual(['groq'])
    expect(settings.release).toEqual({ alma: 'insert', herdr: 'insert' })
  })

  it('builds the chain from enabled, usable engines in order', () => {
    let settings = moveEngine(defaultSpeechSettings(), 'groq', 0)
    settings = setEngineEnabled(settings, 'openai', false)
    expect(engineChain(settings).map((engine) => engine.id)).toEqual([
      'groq',
      'soniox-rt',
      'soniox-async',
      'siliconflow',
    ])
    expect(primaryEngineId(settings)).toBe('groq')
    settings = {
      ...settings,
      custom: { baseUrl: 'https://asr.example.test/v1', model: 'small' },
    }
    expect(engineChain(settings).at(-1)?.id).toBe('custom')
  })

  it('never switches off the last enabled engine', () => {
    let settings = defaultSpeechSettings()
    for (const id of settings.order)
      settings = setEngineEnabled(settings, id, false)
    expect(settings.disabled).toHaveLength(settings.order.length - 1)
    expect(primaryEngineId(settings)).toBe('custom')
    expect(setEngineEnabled(settings, 'openai', true).disabled).not.toContain(
      'openai',
    )
  })

  it('round-trips and notifies', () => {
    const changed = vi.fn()
    window.addEventListener('alma-speech-settings', changed)
    const settings = {
      ...moveEngine(defaultSpeechSettings(), 'openai', 0),
      models: { openai: 'whisper-1' },
      terms: ['Alma'],
    }
    saveSpeechSettings(settings)
    expect(loadSpeechSettings()).toEqual(settings)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('falls back on corrupt or unknown values', () => {
    localStorage.setItem(SPEECH_SETTINGS_KEY, '{nope')
    expect(primaryEngineId(loadSpeechSettings())).toBe('soniox-rt')
    localStorage.setItem(
      SPEECH_SETTINGS_KEY,
      JSON.stringify({ engineId: 'gone', terms: ['A', 3], models: { x: 1 } }),
    )
    const settings = loadSpeechSettings()
    expect(primaryEngineId(settings)).toBe('soniox-rt')
    expect(settings).toMatchObject({ terms: ['A'], models: {} })
  })

  it('applies the chosen model only when the preset offers it', () => {
    const settings = defaultSpeechSettings()
    expect(
      resolveEngine({ ...settings, models: { openai: 'whisper-1' } }, 'openai')
        .model,
    ).toBe('whisper-1')
    expect(
      resolveEngine({ ...settings, models: { openai: 'other' } }, 'openai')
        .model,
    ).toBe('gpt-transcribe')
  })

  it('resolves the custom endpoint from settings', () => {
    const settings = {
      ...moveEngine(defaultSpeechSettings(), 'custom', 0),
      custom: { baseUrl: ' https://asr.example.test/v1 ', model: 'small' },
    }
    const engine = resolveEngine(settings)
    expect(engine).toMatchObject({
      id: 'custom',
      kind: 'openai-compat',
      baseUrl: 'https://asr.example.test/v1',
      model: 'small',
    })
    expect(engineReady(engine)).toBe(true)
    expect(engineReady(resolveEngine(defaultSpeechSettings(), 'custom'))).toBe(
      false,
    )
  })

  it('never stores anything that looks like a key', () => {
    saveSpeechSettings(defaultSpeechSettings())
    expect(localStorage.getItem(SPEECH_SETTINGS_KEY)).not.toMatch(/key/i)
  })
})
