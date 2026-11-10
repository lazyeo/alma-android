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
import { saveSpeechSettings, defaultSpeechSettings } from './engineStore'
import { HOLD_MS, MicButton } from './MicButton'

type Listener = (event: unknown) => void

const fake = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  const ok = () => Promise.resolve(undefined)
  const speech = {
    checkMicPermission: vi.fn(async () => ({ mic: 'granted' as string })),
    requestMicPermission: vi.fn(async () => ({ mic: 'granted' as string })),
    setKey: vi.fn(ok),
    keyStatus: vi.fn(async () => ({ set: true, last4: 'abcd' }) as object),
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

function renderMic(onText = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/thread']}>
      <Routes>
        <Route path="/thread" element={<MicButton onText={onText} />} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return onText
}

const tokens = (
  list: { text: string; is_final: boolean }[],
  finished = false,
) => JSON.stringify({ tokens: list, finished })

async function openRecording() {
  fireEvent.click(screen.getByRole('button', { name: 'Voice input' }))
  await waitFor(() => expect(fake.speech.startStream).toHaveBeenCalled())
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
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

describe('MicButton', () => {
  it('renders nothing without the native recorder', () => {
    fake.available.value = false
    renderMic()
    expect(screen.queryByRole('button', { name: 'Voice input' })).toBeNull()
  })

  it('opens the dictation sheet on tap and names the engine and model', async () => {
    renderMic()
    await openRecording()
    const sheet = screen.getByRole('dialog', { name: 'Voice input' })
    expect(sheet?.textContent).toContain('Soniox')
    expect(sheet?.textContent).toContain('stt-rt-v6')
    expect(fake.speech.startStream).toHaveBeenCalledWith(
      expect.objectContaining({ engineId: 'soniox' }),
    )
  })

  it('previews final text and a lighter non-final tail, then inserts once on Stop', async () => {
    const onText = renderMic()
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

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(fake.speech.stopStream).toHaveBeenCalled())
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([{ text: ' Alma', is_final: true }], true),
      }),
    )
    await waitFor(() => expect(onText).toHaveBeenCalledTimes(1))
    expect(onText).toHaveBeenCalledWith('你好 Alma')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Voice input' })).toBeNull(),
    )
    expect(onText).toHaveBeenCalledTimes(1)
  })

  it('never inserts on Cancel', async () => {
    const onText = renderMic()
    await openRecording()
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([{ text: 'draft', is_final: true }]),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(fake.speech.cancelStream).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Voice input' })).toBeNull()
    expect(onText).not.toHaveBeenCalled()
  })

  it('drops a result that lands while the sheet is closing', async () => {
    const onText = renderMic()
    await openRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(fake.speech.stopStream).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(fake.speech.cancelStream).toHaveBeenCalled()
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([{ text: 'too late', is_final: true }], true),
      }),
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
    expect(onText).not.toHaveBeenCalled()
  })

  it('push-to-talk: release after a hold stops and is not also a tap', async () => {
    const onText = renderMic()
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    await act(() => new Promise((resolve) => setTimeout(resolve, HOLD_MS + 50)))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    )
    fireEvent.pointerUp(button, { button: 0, pointerId: 1 })
    fireEvent.click(button)
    await waitFor(() => expect(fake.speech.stopStream).toHaveBeenCalled())
    expect(fake.speech.startStream).toHaveBeenCalledTimes(1)
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([{ text: 'ship it', is_final: true }], true),
      }),
    )
    await waitFor(() => expect(onText).toHaveBeenCalledWith('ship it'))
  })

  it('without a key explains it and offers voice settings', async () => {
    fake.speech.keyStatus.mockImplementation(async () => ({ set: false }))
    const onText = renderMic()
    fireEvent.click(screen.getByRole('button', { name: 'Voice input' }))
    expect(
      await screen.findByText(
        'Voice input needs an API key for Soniox. Add one in voice settings.',
      ),
    ).toBeTruthy()
    expect(fake.speech.startStream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open voice settings' }))
    expect(await screen.findByText('settings page')).toBeTruthy()
    expect(onText).not.toHaveBeenCalled()
  })

  it('offers what was heard when the stream fails', async () => {
    const onText = renderMic()
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
    expect(onText).toHaveBeenCalledWith('half a thought')
  })

  it('asks for setup before using an incomplete custom endpoint', async () => {
    saveSpeechSettings({ ...defaultSpeechSettings(), engineId: 'custom' })
    renderMic()
    fireEvent.click(screen.getByRole('button', { name: 'Voice input' }))
    expect(
      await screen.findByText(
        'The custom endpoint needs a base URL and a model. Set them in voice settings.',
      ),
    ).toBeTruthy()
    expect(fake.speech.checkMicPermission).not.toHaveBeenCalled()
  })
})
