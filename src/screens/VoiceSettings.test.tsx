// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpeechSettings,
  loadSpeechSettings,
  moveEngine,
  saveSpeechSettings,
} from '../speech/engineStore'
import { TEST_RECORD_MS } from '../speech/VoiceTest'
import { VoiceSettings } from './VoiceSettings'

const fake = vi.hoisted(() => ({
  available: { value: true },
  listeners: new Map<string, Set<(event: unknown) => void>>(),
  fire(name: string, event: unknown) {
    for (const listener of fake.listeners.get(name) ?? []) listener(event)
  },
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
    startRecording: vi.fn(async () => undefined),
    stopRecording: vi.fn(async () => ({ durationMs: 3000 })),
    cancelRecording: vi.fn(async () => undefined),
    transcribe: vi.fn(async (_spec: object) => ({
      status: 200,
      body: '{"text":"hello"}',
    })),
    request: vi.fn(async () => ({ status: 200, body: '{}' })),
    startStream: vi.fn(async (_options: object) => undefined),
    stopStream: vi.fn(async () => undefined),
    cancelStream: vi.fn(async () => undefined),
    addListener: vi.fn(
      async (name: string, listener: (event: unknown) => void) => {
        const set = fake.listeners.get(name) ?? new Set()
        set.add(listener)
        fake.listeners.set(name, set)
        return { remove: async () => void set.delete(listener) }
      },
    ),
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
  fake.listeners.clear()
  fake.available.value = true
  fake.speech.keyStatus.mockImplementation(async () => ({ set: false }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Default settings with `id` as the primary engine. */
const first = (id: string) => moveEngine(defaultSpeechSettings(), id, 0)

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
        engineId: 'soniox',
        key: typed,
        boundUrls: [
          'wss://stt-rt.soniox.com/transcribe-websocket',
          'https://api.soniox.com/v1',
        ],
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

  it('shows one shared key status for both Soniox engines', async () => {
    fake.speech.keyStatus.mockImplementation(async (options: object) =>
      (options as { engineId: string }).engineId === 'soniox'
        ? { set: true, last4: 'abcd' }
        : { set: false },
    )
    for (const engineId of ['soniox-rt', 'soniox-async']) {
      saveSpeechSettings({
        ...first(engineId),
      })
      render(<VoiceSettings />)
      expect(await screen.findByText('••••abcd')).toBeTruthy()
      cleanup()
    }
    saveSpeechSettings({
      ...first('openai'),
    })
    render(<VoiceSettings />)
    expect(await screen.findByText('Not set')).toBeTruthy()
    const asked = fake.speech.keyStatus.mock.calls.map(
      ([options]) => (options as { engineId: string }).engineId,
    )
    // One shared Soniox key id per page, never one per Soniox engine.
    expect(asked.filter((id) => id === 'soniox')).toHaveLength(3)
    expect(asked).not.toContain('soniox-rt')
    expect(asked).not.toContain('soniox-async')
  })

  it('names both Soniox hosts and deletes the shared key once', async () => {
    fake.speech.keyStatus.mockImplementation(async () => ({ set: true }))
    saveSpeechSettings({
      ...first('soniox-async'),
    })
    render(<VoiceSettings />)
    await screen.findByText('Set')
    fireEvent.click(row(/^API key/))
    expect(
      await screen.findByText(
        'Saved only on this phone and sent only to stt-rt.soniox.com, api.soniox.com.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete key' }))
    await waitFor(() =>
      expect(fake.speech.deleteKey).toHaveBeenCalledWith({
        engineId: 'soniox',
      }),
    )
    expect(fake.speech.deleteKey).toHaveBeenCalledTimes(1)
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
      ...first('custom'),
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
    saveSpeechSettings({
      ...first('custom'),
    })
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

  it('Test records a few seconds and shows what was recognised', async () => {
    fake.speech.keyStatus.mockImplementation(async () => ({ set: true }))
    render(<VoiceSettings />)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fireEvent.click(row(/^Test/))
      await waitFor(() => expect(fake.speech.startStream).toHaveBeenCalled())
      await screen.findByText(/Recording for 3 seconds/)
      act(() =>
        fake.fire('streamMessage', {
          data: '{"tokens":[{"text":"你好","is_final":true}]}',
        }),
      )
      expect(fake.speech.stopStream).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(TEST_RECORD_MS)
      })
      await waitFor(() => expect(fake.speech.stopStream).toHaveBeenCalled())
      act(() =>
        fake.fire('streamMessage', {
          data: '{"tokens":[{"text":" Alma","is_final":true}],"finished":true}',
        }),
      )
      expect(await screen.findByText('你好 Alma')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Test explains a missing key without recording', async () => {
    saveSpeechSettings({
      ...first('openai'),
    })
    render(<VoiceSettings />)
    fireEvent.click(row(/^Test/))
    expect(
      await screen.findByText(
        'Voice input needs an API key for OpenAI. Add one in voice settings.',
      ),
    ).toBeTruthy()
    expect(fake.speech.startRecording).not.toHaveBeenCalled()
  })

  it('lists engines in order and reorders them by keyboard or drag', async () => {
    render(<VoiceSettings />)
    fireEvent.click(row(/^Engine/))
    const list = await screen.findByRole('dialog', { name: 'Engines' })
    const names = () =>
      [...list.querySelectorAll('.voice-engine-name')].map(
        (item) => item.textContent,
      )
    expect(names().slice(0, 3)).toEqual(['Soniox', 'OpenAI', 'Soniox Async'])
    const meta = () =>
      [...list.querySelectorAll('.voice-engine-meta')].map((item) =>
        [...item.children].map((part) => part.textContent),
      )
    // No key is saved in this test, so each engine says so.
    expect(meta()[0]).toEqual(['Primary', 'stt-rt-v6', 'No API key'])
    expect(meta()[1]).toEqual(['Fallback 1', 'gpt-transcribe', 'No API key'])
    expect(meta().at(-1)).toEqual(['Fallback 5', 'Not set up'])

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Soniox' }), {
      key: 'ArrowDown',
    })
    expect(loadSpeechSettings().order.slice(0, 2)).toEqual([
      'openai',
      'soniox-rt',
    ])
    expect(names()[0]).toBe('OpenAI')

    // Drag Groq (4th) up by two rows (56 px each without layout).
    const handle = screen.getByRole('button', { name: 'Reorder Groq' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 300 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 240 })
    fireEvent.pointerMove(
      screen.getByRole('button', { name: 'Reorder Groq' }),
      { pointerId: 1, clientY: 180 },
    )
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Reorder Groq' }), {
      pointerId: 1,
    })
    expect(loadSpeechSettings().order.indexOf('groq')).toBe(1)
  })

  it('switches engines off but keeps the last one on', async () => {
    render(<VoiceSettings />)
    fireEvent.click(row(/^Engine/))
    await screen.findByRole('dialog', { name: 'Engines' })
    fireEvent.click(screen.getByRole('switch', { name: 'Use OpenAI' }))
    expect(loadSpeechSettings().disabled).toEqual(['openai'])
    expect(
      screen
        .getByRole('switch', { name: 'Use OpenAI' })
        .getAttribute('aria-checked'),
    ).toBe('false')
    for (const name of [
      'Soniox Async',
      'Groq',
      'SiliconFlow',
      'Custom endpoint',
    ])
      fireEvent.click(screen.getByRole('switch', { name: `Use ${name}` }))
    const last = screen.getByRole('switch', {
      name: 'Use Soniox',
    }) as HTMLButtonElement
    expect(last.disabled).toBe(true)
    expect(loadSpeechSettings().disabled).not.toContain('soniox-rt')
  })

  it('sets up a fallback engine from the list', async () => {
    render(<VoiceSettings />)
    fireEvent.click(row(/^Engine/))
    await screen.findByRole('dialog', { name: 'Engines' })
    fireEvent.click(screen.getByText('Groq'))
    const groq = await screen.findByRole('dialog', { name: 'Groq' })
    fireEvent.click(within(groq).getByRole('button', { name: /^API key/ }))
    const input = await screen.findByLabelText('API key')
    fireEvent.change(input, { target: { value: 'gsk-test-0000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(fake.speech.setKey).toHaveBeenCalledWith({
        engineId: 'groq',
        key: 'gsk-test-0000',
        boundUrls: ['https://api.groq.com/openai/v1'],
      }),
    )
  })

  it('sets what release does per composer', async () => {
    render(<VoiceSettings />)
    const alma = row(/^Alma chat: after release/)
    const herdr = row(/^Herdr agents: after release/)
    expect(alma.textContent).toContain('Send')
    expect(herdr.textContent).toContain('Put in the input box')
    fireEvent.click(alma)
    fireEvent.click(
      await screen.findByRole('button', { name: /^Put in the input box/ }),
    )
    expect(loadSpeechSettings().release).toEqual({
      alma: 'insert',
      herdr: 'insert',
    })
  })
})
