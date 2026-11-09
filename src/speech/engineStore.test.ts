import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpeechSettings,
  engineReady,
  loadSpeechSettings,
  resolveEngine,
  saveSpeechSettings,
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
  it('defaults to Soniox and the generic terms', () => {
    expect(loadSpeechSettings()).toEqual({
      engineId: 'soniox-rt',
      models: {},
      custom: { baseUrl: '', model: '' },
      terms: [...DEFAULT_TERMS],
    })
  })

  it('round-trips and notifies', () => {
    const changed = vi.fn()
    window.addEventListener('alma-speech-settings', changed)
    const settings = {
      ...defaultSpeechSettings(),
      engineId: 'openai',
      models: { openai: 'whisper-1' },
      terms: ['Alma'],
    }
    saveSpeechSettings(settings)
    expect(loadSpeechSettings()).toEqual(settings)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('falls back on corrupt or unknown values', () => {
    localStorage.setItem(SPEECH_SETTINGS_KEY, '{nope')
    expect(loadSpeechSettings().engineId).toBe('soniox-rt')
    localStorage.setItem(
      SPEECH_SETTINGS_KEY,
      JSON.stringify({ engineId: 'gone', terms: ['A', 3], models: { x: 1 } }),
    )
    expect(loadSpeechSettings()).toMatchObject({
      engineId: 'soniox-rt',
      terms: ['A'],
      models: {},
    })
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
      ...defaultSpeechSettings(),
      engineId: 'custom',
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
