// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpeechSettings,
  saveSpeechSettings,
  setEngineEnabled,
} from './engineStore'
import { HOLD_MS, MicButton } from './MicButton'

type Listener = (event: unknown) => void

const fake = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  const ok = () => Promise.resolve(undefined)
  const speech = {
    checkMicPermission: vi.fn(async () => ({ mic: 'granted' as string })),
    requestMicPermission: vi.fn(async () => ({ mic: 'granted' as string })),
    setKey: vi.fn(ok),
    keyStatus: vi.fn(
      async (_options?: object) => ({ set: true, last4: 'abcd' }) as object,
    ),
    deleteKey: vi.fn(ok),
    startRecording: vi.fn(ok),
    stopRecording: vi.fn(async () => ({ durationMs: 2000 })),
    cancelRecording: vi.fn(ok),
    transcribe: vi.fn(async () => ({ status: 200, body: '{"text":"hi"}' })),
    startStream: vi.fn(ok),
    stopStream: vi.fn(ok),
    cancelStream: vi.fn(ok),
    addListener: vi.fn(async (name: string, listener: Listener) => {
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
      return { remove: async () => void set.delete(listener) }
    }),
  }
  return {
    speech,
    listeners,
    available: { value: true },
    fire(name: string, event: unknown) {
      for (const listener of listeners.get(name) ?? []) listener(event)
    },
  }
})

vi.mock('./nativeSpeech', () => ({
  Speech: fake.speech,
  speechAvailable: () => fake.available.value,
}))

const haptics = vi.hoisted(() => ({
  haptic: vi.fn(async (_kind: string) => {}),
}))
vi.mock('../haptics', () => haptics)

type MicProps = Partial<Parameters<typeof MicButton>[0]>

function renderMic(props: MicProps = {}) {
  const handlers = {
    onInsert: vi.fn(),
    onSend: vi.fn(),
    draft: vi.fn(() => ''),
  }
  const merged = { surface: 'alma' as const, ...handlers, ...props }
  render(
    <MemoryRouter initialEntries={['/thread']}>
      <Routes>
        <Route path="/thread" element={<MicButton {...merged} />} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return handlers
}

const mic = () => screen.getByRole('button', { name: 'Voice input' })

const tokens = (
  list: { text: string; is_final: boolean }[],
  finished = false,
) => JSON.stringify({ tokens: list, finished })

const recordingReady = () =>
  waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )

async function openRecording() {
  fireEvent.click(mic())
  await waitFor(() => expect(fake.speech.startStream).toHaveBeenCalled())
  await recordingReady()
}

/** Presses and holds the mic until push-to-talk is recording. */
async function hold() {
  fireEvent.pointerDown(mic(), {
    button: 0,
    pointerId: 1,
    clientX: 200,
    clientY: 600,
  })
  await act(() => new Promise((resolve) => setTimeout(resolve, HOLD_MS + 50)))
  await waitFor(() => expect(fake.speech.startStream).toHaveBeenCalled())
  await waitFor(() =>
    expect(document.querySelector('.dictation-hold')).not.toBeNull(),
  )
  // Let recording begin, so a release stops at once.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

const activeZone = () =>
  document
    .querySelector('.dictation-hold-zone[data-active="true"]')
    ?.getAttribute('data-zone')

/** Ends the stream with this final text once Stop has been sent. */
async function finishWith(text: string) {
  await waitFor(() => expect(fake.speech.stopStream).toHaveBeenCalled())
  act(() =>
    fake.fire('streamMessage', {
      data: tokens([{ text, is_final: true }], true),
    }),
  )
}

function onlyEngine(id: string) {
  let settings = defaultSpeechSettings()
  for (const other of settings.order)
    if (other !== id) settings = setEngineEnabled(settings, other, false)
  saveSpeechSettings(settings)
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  fake.available.value = true
  fake.listeners.clear()
  vi.clearAllMocks()
  fake.speech.keyStatus.mockImplementation(async () => ({
    set: true,
    last4: 'abcd',
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MicButton taps', () => {
  it('renders nothing without the native recorder', () => {
    fake.available.value = false
    renderMic()
    expect(screen.queryByRole('button', { name: 'Voice input' })).toBeNull()
  })

  it('opens the sheet with Cancel, Edit and Send and names the engine', async () => {
    renderMic()
    await openRecording()
    const sheet = screen.getByRole('dialog', { name: 'Voice input' })
    expect(sheet.textContent).toContain('Soniox')
    expect(sheet.textContent).toContain('stt-rt-v6')
    for (const name of ['Cancel', 'Edit', 'Send'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(fake.speech.startStream).toHaveBeenCalledWith(
      expect.objectContaining({ engineId: 'soniox' }),
    )
  })

  it('previews a lighter tail, then Send sends once', async () => {
    const { onSend, onInsert } = renderMic()
    await openRecording()
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([
          { text: '你好', is_final: true },
          { text: ' Alma', is_final: false },
        ]),
      }),
    )
    expect(document.querySelector('.dictation-final')?.textContent).toContain(
      '你好',
    )
    const tail = document.querySelector('.dictation-tail')
    expect(tail?.textContent).toContain('Alma')
    expect(tail?.getAttribute('data-final')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await finishWith(' Alma')
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledWith('你好 Alma')
    expect(onInsert).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Voice input' })).toBeNull(),
    )
  })

  it('Edit puts the result at the caret instead of sending', async () => {
    const { onSend, onInsert } = renderMic()
    await openRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await finishWith('改一下再发')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('改一下再发', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('offers only Edit where the composer cannot send', async () => {
    renderMic({ onSend: undefined })
    await openRecording()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' }).className).toBe(
      'primary',
    )
  })

  it('never delivers on Cancel', async () => {
    const { onSend, onInsert } = renderMic()
    await openRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(fake.speech.cancelStream).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Voice input' })).toBeNull()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('drops a result that lands while the sheet is closing', async () => {
    const { onSend, onInsert } = renderMic()
    await openRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(fake.speech.stopStream).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(fake.speech.cancelStream).toHaveBeenCalled()
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([{ text: 'too late', is_final: true }], true),
      }),
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })
})

describe('MicButton push-to-talk', () => {
  it('sends on release in place and is not also a tap', async () => {
    const { onSend } = renderMic()
    await hold()
    expect(activeZone()).toBe('release')
    expect(document.querySelector('.dictation-hold')?.textContent).toContain(
      'Release to send',
    )
    fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 })
    fireEvent.click(mic())
    await finishWith('ship it')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('ship it'))
    expect(fake.speech.startStream).toHaveBeenCalledTimes(1)
  })

  it('lights the zone under the finger with one haptic per change', async () => {
    renderMic()
    await hold()
    haptics.haptic.mockClear()
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 200, clientY: 480 })
    expect(activeZone()).toBe('cancel')
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 200, clientY: 470 })
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 90, clientY: 590 })
    expect(activeZone()).toBe('edit')
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 195, clientY: 600 })
    expect(activeZone()).toBe('release')
    expect(
      haptics.haptic.mock.calls.filter(([kind]) => kind === 'selection'),
    ).toHaveLength(3)
  })

  it('cancels when released after sliding up', async () => {
    const { onSend, onInsert } = renderMic()
    await hold()
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 200, clientY: 450 })
    fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 })
    await waitFor(() => expect(fake.speech.cancelStream).toHaveBeenCalled())
    expect(fake.speech.stopStream).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Voice input' })).toBeNull()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('puts the result in the composer when released after sliding left', async () => {
    const { onSend, onInsert } = renderMic()
    await hold()
    fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 60, clientY: 600 })
    fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 })
    await finishWith('先放着')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('先放着', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('follows the Herdr default and inserts on release', async () => {
    const { onSend, onInsert } = renderMic({ surface: 'herdr' })
    await hold()
    expect(document.querySelector('.dictation-hold')?.textContent).toContain(
      'Release to put it in the input box',
    )
    fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 })
    await finishWith('ls -la')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('ls -la', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('holds back a too-short result and says why', async () => {
    const { onSend, onInsert } = renderMic()
    await hold()
    fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 })
    await finishWith('嗯')
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith('嗯', 'caret'))
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Too short to send, so it went into the input box.',
    )
  })

  it('appends to typed text instead of sending it', async () => {
    const { onSend, onInsert } = renderMic({ draft: () => '已经写了一半' })
    await hold()
    fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 })
    await finishWith('后半句')
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith('后半句', 'end'))
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Added after what you had typed. Send it when ready.',
    )
  })
})

describe('MicButton errors and fallback', () => {
  it('names the fallback engine and why it took over', async () => {
    renderMic()
    await openRecording()
    act(() =>
      fake.fire('streamClosed', { code: 1006, reason: '', error: 'reset' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Voice input' })
    await waitFor(() =>
      expect(sheet.textContent).toContain(
        'Soniox couldn’t connect, now using OpenAI',
      ),
    )
    expect(document.querySelector('.dictation-engine-label')?.textContent).toBe(
      'OpenAI',
    )
  })

  it('without a key explains it and offers voice settings', async () => {
    fake.speech.keyStatus.mockImplementation(async () => ({ set: false }))
    const { onSend, onInsert } = renderMic()
    fireEvent.click(mic())
    expect(
      await screen.findByText(
        'Voice input needs an API key for Soniox. Add one in voice settings.',
      ),
    ).toBeTruthy()
    expect(fake.speech.startStream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open voice settings' }))
    expect(await screen.findByText('settings page')).toBeTruthy()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('offers what was heard when the only engine fails', async () => {
    onlyEngine('soniox-rt')
    const { onInsert } = renderMic()
    await openRecording()
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([{ text: 'half a thought', is_final: true }]),
      }),
    )
    act(() => fake.fire('streamClosed', { code: 1006, reason: '' }))
    expect(
      await screen.findByText(
        'Couldn’t reach the speech service. Check your connection and try again.',
      ),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert what was heard' }),
    )
    expect(onInsert).toHaveBeenCalledWith('half a thought', 'caret')
  })

  it('asks for setup when no enabled engine can run', async () => {
    onlyEngine('custom')
    renderMic()
    fireEvent.click(mic())
    expect(
      await screen.findByText(
        'The custom endpoint needs a base URL and a model. Set them in voice settings.',
      ),
    ).toBeTruthy()
    expect(fake.speech.checkMicPermission).not.toHaveBeenCalled()
  })
})
