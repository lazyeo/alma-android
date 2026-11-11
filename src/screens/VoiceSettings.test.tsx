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

type Status = { set: boolean; last4?: string }

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
    pasteKey: vi.fn(
      async (_options: object): Promise<{ set: boolean; last4?: string }> => ({
        set: true,
        last4: 'past',
      }),
    ),
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
    request: vi.fn(async (_spec: object) => ({ status: 200, body: '{}' })),
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

/** Key statuses by key id; anything unlisted has no key. */
function keys(saved: Record<string, Status>) {
  fake.speech.keyStatus.mockImplementation(
    async (options: object) =>
      saved[(options as { engineId: string }).engineId] ?? { set: false },
  )
}

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.clearAllMocks()
  fake.listeners.clear()
  fake.available.value = true
  keys({})
  fake.speech.request.mockImplementation(async () => ({
    status: 200,
    body: '{}',
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Default settings with `id` as the primary engine. */
const first = (id: string) => moveEngine(defaultSpeechSettings(), id, 0)

const engineRow = (name: string) =>
  screen
    .getAllByRole('listitem')
    .find(
      (item) =>
        item.querySelector('.voice-engine-main .voice-row-name')
          ?.textContent === name,
    )!
const providerRow = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('.voice-provider')].find(
    (item) => item.querySelector('.voice-row-name')?.textContent === name,
  )!
const openProvider = (name: string) =>
  fireEvent.click(within(providerRow(name)).getAllByRole('button')[0])
const listedNames = () =>
  [
    ...document.querySelectorAll(
      '.voice-engine-list:not(.voice-engine-more) .voice-engine-main .voice-row-name',
    ),
  ].map((item) => item.textContent)

describe('VoiceSettings', () => {
  it('is hidden without the native recorder', () => {
    fake.available.value = false
    const { container } = render(<VoiceSettings />)
    expect(container.innerHTML).toBe('')
  })

  it('shows each engine’s key state: last four, shared Soniox, or none', async () => {
    keys({ soniox: { set: true, last4: 'abcd' } })
    render(<VoiceSettings />)
    await waitFor(() =>
      expect(engineRow('Soniox').textContent).toContain('••••abcd'),
    )
    expect(engineRow('Soniox').textContent).toContain('Shared Soniox key')
    expect(engineRow('Soniox Async').textContent).toContain('Shared Soniox key')
    expect(engineRow('OpenAI').textContent).toContain('No key')
    expect(providerRow('Soniox').textContent).toContain('••••abcd')
    expect(providerRow('OpenAI').textContent).toContain('Not set')
    // One status call per provider: the shared Soniox key is asked for once.
    const asked = fake.speech.keyStatus.mock.calls.map(
      ([options]) => (options as { engineId: string }).engineId,
    )
    expect(asked.sort()).toEqual(
      ['custom', 'groq', 'openai', 'siliconflow', 'soniox'].sort(),
    )
  })

  it('folds uncommon engines under More engines', async () => {
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    expect(listedNames()).toEqual(['Soniox', 'OpenAI', 'Soniox Async'])
    expect(screen.queryByRole('switch', { name: 'Use Groq' })).toBeNull()
    const more = screen.getByRole('button', { name: /More engines/ })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(engineRow('Groq')).toBeTruthy()
    expect(engineRow('Custom endpoint').textContent).toContain(
      'Endpoint not set',
    )
  })

  it('saves a typed key natively, never to localStorage, then checks it', async () => {
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    openProvider('OpenAI')
    const input = screen.getByLabelText('API key for OpenAI')
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
    const typed = 'sk-test-secret-wxyz'
    keys({ openai: { set: true, last4: 'wxyz' } })
    fireEvent.change(input, { target: { value: typed } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(fake.speech.setKey).toHaveBeenCalledWith({
        engineId: 'openai',
        key: typed,
        boundUrls: ['https://api.openai.com/v1'],
      }),
    )
    expect(await screen.findByText('Key works')).toBeTruthy()
    expect(fake.speech.request).toHaveBeenCalledWith({
      engineId: 'openai',
      method: 'GET',
      url: 'https://api.openai.com/v1/models',
    })
    expect(engineRow('OpenAI').textContent).toContain('••••wxyz')
    for (const [key, value] of storage.values) {
      expect(key).not.toContain(typed)
      expect(value).not.toContain(typed)
    }
  })

  it('names why a saved key failed its check', async () => {
    fake.speech.request.mockImplementation(async () => ({
      status: 401,
      body: '{}',
    }))
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    openProvider('OpenAI')
    keys({ openai: { set: true, last4: 'wxyz' } })
    fireEvent.change(screen.getByLabelText('API key for OpenAI'), {
      target: { value: 'sk-wrong-0000wxyz' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Key rejected')
    expect(status.textContent).toContain('HTTP 401')
    expect(engineRow('OpenAI').textContent).toContain('Key rejected')
  })

  it('pastes a key natively, so it never passes through JS', async () => {
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    openProvider('Soniox')
    fireEvent.click(
      screen.getByRole('button', { name: 'Paste from clipboard' }),
    )
    await waitFor(() =>
      expect(fake.speech.pasteKey).toHaveBeenCalledWith({
        engineId: 'soniox',
        boundUrls: [
          'wss://stt-rt.soniox.com/transcribe-websocket',
          'https://api.soniox.com/v1',
        ],
      }),
    )
    expect(fake.speech.setKey).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(engineRow('Soniox').textContent).toContain('••••past'),
    )
    // Soniox's model list is public, so the check lists files instead.
    expect(fake.speech.request).toHaveBeenCalledWith({
      engineId: 'soniox',
      method: 'GET',
      url: 'https://api.soniox.com/v1/files',
    })
  })

  it('says so when the clipboard holds no key', async () => {
    fake.speech.pasteKey.mockImplementationOnce(async () => {
      throw Object.assign(new Error('empty'), { code: 'clipboard_empty' })
    })
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    openProvider('OpenAI')
    fireEvent.click(
      screen.getByRole('button', { name: 'Paste from clipboard' }),
    )
    expect(
      await screen.findByText('The clipboard doesn’t hold an API key.'),
    ).toBeTruthy()
  })

  it('asks for the key in place when a key-less engine is switched on', async () => {
    saveSpeechSettings({ ...defaultSpeechSettings(), disabled: ['groq'] })
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    fireEvent.click(screen.getByRole('button', { name: /More engines/ }))
    const toggle = () => screen.getByRole('switch', { name: 'Use Groq' })
    fireEvent.click(toggle())
    // Not on yet: only once the key is saved.
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    expect(loadSpeechSettings().disabled).toContain('groq')
    const input = within(engineRow('Groq')).getByLabelText('API key for Groq')
    keys({ groq: { set: true, last4: '0000' } })
    fireEvent.change(input, { target: { value: 'gsk-test-0000' } })
    fireEvent.click(
      within(engineRow('Groq')).getByRole('button', { name: 'Save' }),
    )
    await waitFor(() =>
      expect(fake.speech.setKey).toHaveBeenCalledWith({
        engineId: 'groq',
        key: 'gsk-test-0000',
        boundUrls: ['https://api.groq.com/openai/v1'],
      }),
    )
    await waitFor(() =>
      expect(toggle().getAttribute('aria-checked')).toBe('true'),
    )
    expect(loadSpeechSettings().disabled).not.toContain('groq')
    // On now, so it joins the listed order.
    expect(listedNames()).toContain('Groq')
  })

  it('switches an engine with a key straight on and off', async () => {
    keys({ openai: { set: true }, soniox: { set: true } })
    render(<VoiceSettings />)
    const openai = () => screen.getByRole('switch', { name: 'Use OpenAI' })
    await waitFor(() =>
      expect(openai().getAttribute('aria-checked')).toBe('true'),
    )
    fireEvent.click(openai())
    expect(loadSpeechSettings().disabled).toEqual(['openai'])
    expect(openai().getAttribute('aria-checked')).toBe('false')
    fireEvent.click(openai())
    expect(loadSpeechSettings().disabled).toEqual([])
  })

  it('keeps the last engine in use on', async () => {
    keys({ openai: { set: true } })
    render(<VoiceSettings />)
    const openai = await screen.findByRole('switch', { name: 'Use OpenAI' })
    await waitFor(() =>
      expect((openai as HTMLButtonElement).disabled).toBe(true),
    )
    expect(
      (screen.getByRole('switch', { name: 'Use Soniox' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('reorders the listed engines by keyboard or drag', async () => {
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    expect(listedNames()).toEqual(['Soniox', 'OpenAI', 'Soniox Async'])
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Soniox' }), {
      key: 'ArrowDown',
    })
    expect(loadSpeechSettings().order.slice(0, 2)).toEqual([
      'openai',
      'soniox-rt',
    ])
    expect(listedNames()).toEqual(['OpenAI', 'Soniox', 'Soniox Async'])

    // Drag Soniox Async (3rd) up by two rows (56 px each without layout).
    const handle = () =>
      screen.getByRole('button', { name: 'Reorder Soniox Async' })
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 240 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 180 })
    fireEvent.pointerUp(handle(), { pointerId: 1 })
    expect(listedNames()).toEqual(['Soniox Async', 'OpenAI', 'Soniox'])
    expect(loadSpeechSettings().order[0]).toBe('soniox-async')
    // Folded engines keep their place behind the listed ones.
    expect(loadSpeechSettings().order.slice(3)).toEqual([
      'groq',
      'siliconflow',
      'custom',
    ])
  })

  it('picks a model and tests only that engine from its row', async () => {
    keys({ openai: { set: true }, soniox: { set: true } })
    render(<VoiceSettings />)
    await waitFor(() =>
      expect(engineRow('OpenAI').textContent).toContain('OpenAI'),
    )
    await screen.findAllByText('Shared Soniox key')
    fireEvent.click(within(engineRow('OpenAI')).getAllByRole('button')[1])
    fireEvent.click(screen.getByRole('button', { name: 'whisper-1' }))
    expect(loadSpeechSettings().models.openai).toBe('whisper-1')
    fireEvent.click(screen.getByRole('button', { name: 'Test OpenAI' }))
    await waitFor(() => expect(fake.speech.startRecording).toHaveBeenCalled())
    // Only OpenAI: the Soniox stream above it in the order is not opened.
    expect(fake.speech.startStream).not.toHaveBeenCalled()
  })

  it('deletes the shared Soniox key once and names both hosts', async () => {
    keys({ soniox: { set: true, last4: 'abcd' } })
    render(<VoiceSettings />)
    await waitFor(() =>
      expect(providerRow('Soniox').textContent).toContain('••••abcd'),
    )
    openProvider('Soniox')
    expect(
      screen.getByText(
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
    await waitFor(() =>
      expect(engineRow('Soniox').textContent).toContain('No key'),
    )
  })

  it('clears the custom key when the base URL changes', async () => {
    saveSpeechSettings({
      ...first('custom'),
      custom: { baseUrl: 'https://old.example.com/v1', model: 'whisper-1' },
    })
    keys({ custom: { set: true, last4: 'abcd' } })
    render(<VoiceSettings />)
    await waitFor(() =>
      expect(providerRow('Custom endpoint').textContent).toContain('••••abcd'),
    )
    openProvider('Custom endpoint')
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://new.example.com/v1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }))
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

  it('rejects a plain http base URL', async () => {
    render(<VoiceSettings />)
    await screen.findAllByText('No key')
    openProvider('Custom endpoint')
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'http://example.com/v1' },
    })
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'whisper-1' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'Save endpoint',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(screen.getByText('Use an https address.')).toBeTruthy()
    // No key field until there is an endpoint to bind it to.
    expect(screen.queryByLabelText('API key for Custom endpoint')).toBeNull()
  })

  it('sets what release does per composer in place', async () => {
    render(<VoiceSettings />)
    const group = (name: string) => screen.getByRole('group', { name })
    const pressed = (name: string) =>
      within(group(name))
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent)
    expect(pressed('Alma chat')).toEqual(['Send'])
    expect(pressed('Herdr agents')).toEqual(['Insert'])
    fireEvent.click(
      within(group('Alma chat')).getByRole('button', { name: 'Insert' }),
    )
    expect(loadSpeechSettings().release).toEqual({
      alma: 'insert',
      herdr: 'insert',
    })
    expect(pressed('Alma chat')).toEqual(['Insert'])
  })

  it('saves edited terms parsed one per line', async () => {
    render(<VoiceSettings />)
    fireEvent.click(screen.getByRole('button', { name: /^Terms/ }))
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
    keys({ soniox: { set: true } })
    render(<VoiceSettings />)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fireEvent.click(screen.getByRole('button', { name: /^Test/ }))
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
    saveSpeechSettings({ ...first('openai') })
    render(<VoiceSettings />)
    fireEvent.click(screen.getByRole('button', { name: /^Test/ }))
    expect(
      await screen.findByText(
        'Voice input needs an API key for OpenAI. Add one in voice settings.',
      ),
    ).toBeTruthy()
    expect(fake.speech.startRecording).not.toHaveBeenCalled()
  })
})
