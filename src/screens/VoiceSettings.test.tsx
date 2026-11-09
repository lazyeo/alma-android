// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpeechSettings,
  loadSpeechSettings,
  saveSpeechSettings,
} from '../speech/engineStore'
import { VoiceSettings } from './VoiceSettings'

const fake = vi.hoisted(() => ({
  available: { value: true },
  speech: {
    checkMicPermission: vi.fn(async () => ({ mic: 'granted' as string })),
    requestMicPermission: vi.fn(async () => ({ mic: 'granted' as string })),
    setKey: vi.fn(async (_options: object) => undefined),
    keyStatus: vi.fn(
      async (_options: object): Promise<{ set: boolean; last4?: string }> => ({
        set: false,
      }),
    ),
    deleteKey: vi.fn(async (_options: object) => undefined),
  },
}))

vi.mock('../speech/nativeSpeech', () => ({
  Speech: fake.speech,
  speechAvailable: () => fake.available.value,
}))

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
}

let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.clearAllMocks()
  fake.available.value = true
  fake.speech.keyStatus.mockImplementation(async () => ({ set: false }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const row = (name: RegExp) => screen.getByRole('button', { name })

describe('VoiceSettings', () => {
  it('is hidden without the native recorder', () => {
    fake.available.value = false
    const { container } = render(<VoiceSettings />)
    expect(container.innerHTML).toBe('')
  })

  it('saves the key natively, bound to the engine URL, and never to localStorage', async () => {
    render(<VoiceSettings />)
    await screen.findByText('Not set')
    fireEvent.click(row(/^API key/))
    const input = await screen.findByLabelText('API key')
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
    const typed = 'sk-test-secret-wxyz'
    fake.speech.keyStatus.mockImplementation(async () => ({
      set: true,
      last4: 'wxyz',
    }))
    fireEvent.change(input, { target: { value: typed } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(fake.speech.setKey).toHaveBeenCalledWith({
        engineId: 'soniox-rt',
        key: typed,
        boundUrl: 'wss://stt-rt.soniox.com/transcribe-websocket',
      }),
    )
    expect(await screen.findByText('Set')).toBeTruthy()
    expect(screen.getByText('wxyz', { exact: false }).textContent).toBe(
      '••••wxyz',
    )
    for (const [key, value] of storage.values) {
      expect(key).not.toContain(typed)
      expect(value).not.toContain(typed)
    }
  })

  it('shows the last four of a saved key', async () => {
    fake.speech.keyStatus.mockImplementation(async () => ({
      set: true,
      last4: 'abcd',
    }))
    render(<VoiceSettings />)
    expect((await screen.findByText('••••abcd')).textContent).toBe('••••abcd')
    expect(screen.getByText('Set')).toBeTruthy()
  })

  it('clears the custom key when the base URL changes', async () => {
    saveSpeechSettings({
      ...defaultSpeechSettings(),
      engineId: 'custom',
      custom: { baseUrl: 'https://old.example.com/v1', model: 'whisper-1' },
    })
    fake.speech.keyStatus.mockImplementation(async () => ({
      set: true,
      last4: 'abcd',
    }))
    render(<VoiceSettings />)
    await screen.findByText('••••abcd')
    fireEvent.click(row(/^Custom endpoint/))
    fireEvent.change(await screen.findByLabelText('Base URL'), {
      target: { value: 'https://new.example.com/v1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(fake.speech.deleteKey).toHaveBeenCalledWith({
        engineId: 'custom',
      }),
    )
    expect(
      await screen.findByText(
        'The endpoint changed, so the saved key was removed. Enter the key again.',
      ),
    ).toBeTruthy()
    expect(loadSpeechSettings().custom.baseUrl).toBe(
      'https://new.example.com/v1',
    )
  })

  it('rejects a plain http base URL on the public internet', async () => {
    saveSpeechSettings({ ...defaultSpeechSettings(), engineId: 'custom' })
    render(<VoiceSettings />)
    fireEvent.click(row(/^Custom endpoint/))
    fireEvent.change(await screen.findByLabelText('Base URL'), {
      target: { value: 'http://example.com/v1' },
    })
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'whisper-1' },
    })
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(fake.speech.deleteKey).not.toHaveBeenCalled()
  })

  it('saves edited terms parsed one per line', async () => {
    render(<VoiceSettings />)
    fireEvent.click(row(/^Terms/))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Terms' }), {
      target: { value: 'Alma\n  Herdr \nalma\nSoniox, WebSocket\n\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(loadSpeechSettings().terms).toEqual([
        'Alma',
        'Herdr',
        'Soniox',
        'WebSocket',
      ]),
    )
    expect(await screen.findByText('4 terms')).toBeTruthy()
  })

  it('offers the microphone permission when it is not granted', async () => {
    fake.speech.checkMicPermission.mockImplementation(async () => ({
      mic: 'denied',
    }))
    fake.speech.requestMicPermission.mockImplementation(async () => ({
      mic: 'granted',
    }))
    render(<VoiceSettings />)
    fireEvent.click(await screen.findByRole('button', { name: /microphone/ }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /microphone/ })).toBeNull(),
    )
    expect(fake.speech.requestMicPermission).toHaveBeenCalled()
  })
})
