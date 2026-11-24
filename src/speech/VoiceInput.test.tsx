// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useRef } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeTopOverlay, resetOverlayStackForTests } from '../overlayStack'
import { MIN_HOLD_MS } from './delivery'
import { MAX_RECORDING_MS } from './dictationSession'
import {
  defaultSpeechSettings,
  saveSpeechSettings,
  setEngineEnabled,
} from './engineStore'
import { holdLayout } from './holdLayout'
import { inputModeKey } from './inputMode'
import {
  LIMIT_GRACE_MS,
  NOTICE_MS,
  useVoiceInput,
  type VoiceInputOptions,
} from './VoiceInput'

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
    request: vi.fn(async (_spec: { method: string }) => ({
      status: 200,
      body: '{}',
    })),
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

/** jsdom's viewport, with no safe-area inset. */
const LAYOUT = holdLayout(window.innerWidth, window.innerHeight, 0)

function Composer(props: Omit<VoiceInputOptions, 'textareaRef'>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const voice = useVoiceInput({ ...props, textareaRef })
  return (
    <div>
      {voice?.toggle}
      {voice?.bar}
      <textarea
        {...voice?.textHold}
        aria-label="Message"
        placeholder="Message"
        ref={textareaRef}
        hidden={Boolean(voice?.bar)}
      />
    </div>
  )
}

function renderComposer(props: Partial<VoiceInputOptions> = {}) {
  const handlers = {
    onInsert: vi.fn(),
    onSend: vi.fn(),
    draft: vi.fn(() => ''),
  }
  const merged = { surface: 'alma' as const, ...handlers, ...props }
  render(
    <MemoryRouter initialEntries={['/thread']}>
      <Routes>
        <Route path="/thread" element={<Composer {...merged} />} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return handlers
}

const bar = () => screen.getByRole('button', { name: 'Hold to talk' })
const overlay = () => document.querySelector('.voice-hold')
const status = () => document.querySelector('.voice-hold-status p')?.textContent
const activeCapsule = () =>
  document.querySelector('.voice-hold-capsule[data-active="true"]')?.textContent

/** Real time, plus however long the test pretends the finger was held. */
let heldFor = 0

function useVoiceMode(surface: 'alma' | 'herdr' = 'alma') {
  localStorage.setItem(inputModeKey(surface), 'voice')
}

const tokens = (
  list: { text: string; is_final: boolean }[],
  finished = false,
) => JSON.stringify({ tokens: list, finished })

/** Presses the bar and waits until the dictation is recording. */
async function press(at = { x: LAYOUT.width / 2, y: LAYOUT.height - 30 }) {
  fireEvent.pointerDown(bar(), {
    button: 0,
    pointerId: 1,
    clientX: at.x,
    clientY: at.y,
  })
  await waitFor(() => expect(overlay()).not.toBeNull())
  await waitFor(() =>
    expect(
      fake.speech.startStream.mock.calls.length +
        fake.speech.startRecording.mock.calls.length,
    ).toBeGreaterThan(0),
  )
  // Let recording begin, so a release stops at once.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

function slide(x: number, y: number) {
  fireEvent.pointerMove(bar(), { pointerId: 1, clientX: x, clientY: y })
}

function letGo(held = MIN_HOLD_MS) {
  heldFor += held
  fireEvent.pointerUp(bar(), { button: 0, pointerId: 1 })
}

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
  heldFor = 0
  const realNow = Date.now.bind(Date)
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + heldFor)
})

afterEach(() => {
  cleanup()
  resetOverlayStackForTests()
  // Drops the own property hideApp() put over the prototype's getter.
  delete (document as { visibilityState?: unknown }).visibilityState
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('voice mode', () => {
  it('offers nothing without the native recorder', () => {
    fake.available.value = false
    renderComposer()
    expect(screen.queryByRole('button', { name: /voice|keyboard/i })).toBeNull()
  })

  it('swaps the text box for the hold bar and back, focusing the text', async () => {
    renderComposer()
    const message = screen.getByLabelText('Message')
    expect(message.hidden).toBe(false)
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to voice input' }),
    )
    expect(bar()).toBeTruthy()
    expect(message.hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to keyboard' }))
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(message))
  })

  it('remembers the mode for each composer separately', () => {
    renderComposer({ surface: 'herdr' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to voice input' }),
    )
    expect(localStorage.getItem(inputModeKey('herdr'))).toBe('voice')
    expect(localStorage.getItem(inputModeKey('alma'))).toBeNull()
    cleanup()
    renderComposer({ surface: 'herdr' })
    expect(bar()).toBeTruthy()
    cleanup()
    renderComposer({ surface: 'alma' })
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull()
  })
})

describe('hold to talk', () => {
  it('sends on release in place, through the composer', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    expect(status()).toBe('Release to send')
    expect(
      document.querySelector('.voice-hold-arc')?.getAttribute('data-active'),
    ).toBe('true')
    letGo()
    await finishWith('hello there')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello there'))
    expect(onInsert).not.toHaveBeenCalled()
    expect(overlay()).toBeNull()
  })

  it('shows the live transcript and the input level in the bubble', async () => {
    useVoiceMode()
    renderComposer()
    await press()
    act(() =>
      fake.fire('streamMessage', {
        data: tokens([
          { text: 'live ', is_final: true },
          { text: 'words', is_final: false },
        ]),
      }),
    )
    act(() => fake.fire('level', { rms: 0.25 }))
    expect(document.querySelector('.voice-hold-text')?.textContent).toBe(
      'live words',
    )
    const bars = [
      ...document.querySelectorAll<HTMLElement>('.voice-hold-wave > span'),
    ]
    expect(bars.at(-1)?.style.height).not.toBe(bars[0].style.height)
  })

  it('lights the capsule under the finger with one haptic per change', async () => {
    useVoiceMode()
    renderComposer()
    await press()
    haptics.haptic.mockClear()
    slide(LAYOUT.cancel.cx, LAYOUT.cancel.cy)
    expect(activeCapsule()).toBe('Cancel')
    expect(status()).toBe('Release to cancel')
    expect(
      document.querySelector('.voice-hold-bubble')?.getAttribute('data-zone'),
    ).toBe('cancel')
    // Moving within the capsule is not another change.
    slide(LAYOUT.cancel.cx + 5, LAYOUT.cancel.cy + 2)
    slide(LAYOUT.edit.cx, LAYOUT.edit.cy)
    expect(activeCapsule()).toBe('Slide here to edit')
    expect(status()).toBe('Release to edit')
    slide(LAYOUT.width / 2, LAYOUT.height - 20)
    expect(activeCapsule()).toBeUndefined()
    expect(status()).toBe('Release to send')
    expect(
      haptics.haptic.mock.calls.filter(([kind]) => kind === 'selection'),
    ).toHaveLength(3)
  })

  it('cancels when released on the cancel capsule', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    slide(LAYOUT.cancel.cx, LAYOUT.cancel.cy)
    letGo()
    await waitFor(() => expect(overlay()).toBeNull())
    expect(fake.speech.cancelStream).toHaveBeenCalled()
    expect(fake.speech.stopStream).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('puts the text in the composer to edit when released on edit', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    slide(LAYOUT.edit.cx, LAYOUT.edit.cy)
    letGo()
    await finishWith('ls -la')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('ls -la', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
    // Back on the keyboard, with the text there to edit.
    expect(screen.getByLabelText('Message').hidden).toBe(false)
    expect(localStorage.getItem(inputModeKey('alma'))).toBe('keyboard')
  })

  it('drops a hold too short to be speech and says so', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    letGo(MIN_HOLD_MS - 200)
    await waitFor(() => expect(overlay()).toBeNull())
    expect(screen.getByRole('status').textContent).toBe(
      'Too short. Hold while you speak.',
    )
    expect(fake.speech.stopStream).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('drops the dictation when the system takes the pointer', async () => {
    useVoiceMode()
    const { onSend } = renderComposer()
    await press()
    fireEvent.pointerCancel(bar(), { pointerId: 1 })
    await waitFor(() => expect(overlay()).toBeNull())
    expect(fake.speech.cancelStream).toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('follows the Herdr default and fills the composer on release', async () => {
    useVoiceMode('herdr')
    const { onSend, onInsert } = renderComposer({ surface: 'herdr' })
    await press()
    expect(status()).toBe('Release to fill in')
    letGo()
    await finishWith('git status')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('git status', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('holds back a too-short result and says why', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    letGo()
    await finishWith('嗯')
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith('嗯', 'caret'))
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Too short to send, so it went into the input box.',
    )
  })

  it('appends to typed text instead of sending it', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer({ draft: () => '已经写了一半' })
    await press()
    letGo()
    await finishWith('后半句')
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith('后半句', 'end'))
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Added after what you had typed. Send it when ready.',
    )
  })

  it('puts a recording that hits the length cap into the composer', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    act(() => fake.fire('recordingStopped', { reason: 'limit' }))
    await finishWith('a very long thought')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('a very long thought', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
    expect(overlay()).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(
      'Recording stopped at the 5-minute limit. What you said is in the input box.',
    )
    // Back on the keyboard: the bar the finger was on is gone.
    expect(screen.getByLabelText('Message').hidden).toBe(false)
  })

  it('shows Transcribing with a way out while a batch engine works', async () => {
    useVoiceMode()
    onlyEngine('openai')
    let answer: (value: { status: number; body: string }) => void = () => {}
    fake.speech.transcribe.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const { onSend } = renderComposer()
    await press()
    letGo()
    await waitFor(() => expect(status()).toBe('Transcribing…'))
    expect(document.querySelector('.voice-hold-capsule')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(overlay()).toBeNull())
    answer({ status: 200, body: '{"text":"too late"}' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('hold to talk errors and fallback', () => {
  it('names the fallback engine and why it took over', async () => {
    useVoiceMode()
    renderComposer()
    await press()
    act(() =>
      fake.fire('streamClosed', { code: 1006, reason: '', error: 'reset' }),
    )
    await waitFor(() =>
      expect(
        document.querySelector('.voice-hold-status small')?.textContent,
      ).toBe('Soniox couldn’t connect, now using OpenAI'),
    )
  })

  it('says when the first engine was skipped for want of a key', async () => {
    useVoiceMode()
    fake.speech.keyStatus.mockImplementation(async (options?: object) => ({
      set: (options as { engineId: string }).engineId !== 'soniox',
    }))
    renderComposer()
    await press()
    await waitFor(() =>
      expect(
        document.querySelector('.voice-hold-status small')?.textContent,
      ).toBe('Soniox has no key set, now using OpenAI'),
    )
    expect(fake.speech.startStream).not.toHaveBeenCalled()
  })

  it('without a key explains it and offers voice settings', async () => {
    useVoiceMode()
    fake.speech.keyStatus.mockImplementation(async () => ({ set: false }))
    const { onSend, onInsert } = renderComposer()
    fireEvent.pointerDown(bar(), { button: 0, pointerId: 1 })
    expect(
      await screen.findByText(
        'Voice input needs an API key for Soniox. Add one in voice settings.',
      ),
    ).toBeTruthy()
    expect(overlay()).toBeNull()
    // The finger lifting afterwards does nothing more.
    letGo()
    fireEvent.click(screen.getByRole('button', { name: 'Open voice settings' }))
    expect(await screen.findByText('settings page')).toBeTruthy()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('offers what was heard when the only engine fails', async () => {
    useVoiceMode()
    onlyEngine('soniox-rt')
    const { onInsert } = renderComposer()
    await press()
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
    expect(overlay()).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert what was heard' }),
    )
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('half a thought', 'caret'),
    )
  })

  it('asks for setup when no enabled engine can run', async () => {
    useVoiceMode()
    onlyEngine('custom')
    renderComposer()
    fireEvent.pointerDown(bar(), { button: 0, pointerId: 1 })
    expect(
      await screen.findByText(
        'The custom endpoint needs a base URL and a model. Set them in voice settings.',
      ),
    ).toBeTruthy()
    expect(overlay()).toBeNull()
    expect(fake.speech.checkMicPermission).not.toHaveBeenCalled()
  })
})

const message = () => screen.getByLabelText('Message') as HTMLTextAreaElement
const BOX = { x: LAYOUT.width / 2, y: LAYOUT.height - 30 }

/** Puts a finger on the text box without lifting it. */
function touchBox(at = BOX) {
  return fireEvent.pointerDown(message(), {
    button: 0,
    pointerId: 1,
    isPrimary: true,
    clientX: at.x,
    clientY: at.y,
  })
}

/** Waits past the long-press delay with the finger still down. */
const waitPastLongPress = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 500)))

const started = () =>
  fake.speech.startStream.mock.calls.length +
  fake.speech.startRecording.mock.calls.length

describe('long press on the text box', () => {
  it('holds to talk from an empty box and sends on release', async () => {
    const { onSend } = renderComposer()
    touchBox()
    await waitPastLongPress()
    await waitFor(() => expect(overlay()).not.toBeNull())
    await waitFor(() => expect(started()).toBeGreaterThan(0))
    expect(status()).toBe('Release to send')
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    heldFor += MIN_HOLD_MS
    fireEvent.pointerUp(message(), { button: 0, pointerId: 1 })
    await finishWith('spoken from the box')
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('spoken from the box'),
    )
    expect(overlay()).toBeNull()
  })

  it('follows the same slides: release on cancel drops it', async () => {
    const { onSend, onInsert } = renderComposer()
    touchBox()
    await waitPastLongPress()
    await waitFor(() => expect(started()).toBeGreaterThan(0))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    fireEvent.pointerMove(message(), {
      pointerId: 1,
      clientX: LAYOUT.cancel.cx,
      clientY: LAYOUT.cancel.cy,
    })
    heldFor += MIN_HOLD_MS
    fireEvent.pointerUp(message(), { button: 0, pointerId: 1 })
    await waitFor(() => expect(overlay()).toBeNull())
    expect(fake.speech.cancelStream).toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('locks from the box like from the bar', async () => {
    renderComposer()
    touchBox()
    await waitPastLongPress()
    await waitFor(() => expect(started()).toBeGreaterThan(0))
    fireEvent.pointerMove(message(), {
      pointerId: 1,
      clientX: LAYOUT.width / 2,
      clientY: LAYOUT.lockLine - 40,
    })
    heldFor += 200
    fireEvent.pointerUp(message(), { button: 0, pointerId: 1 })
    expect(await screen.findByRole('timer')).toBeTruthy()
  })

  it('turns a tap into typing: the box takes focus for the keyboard', async () => {
    renderComposer()
    touchBox()
    fireEvent.pointerUp(message(), { button: 0, pointerId: 1 })
    expect(document.activeElement).toBe(message())
    await waitPastLongPress()
    expect(overlay()).toBeNull()
    expect(started()).toBe(0)
  })

  // Android's WebView runs its own long press on an editable box (callout,
  // insertion handle) and cancels the pointer for it, which killed the hold
  // a moment after it started. Cancelling the touch keeps the press ours.
  it('keeps the WebView from taking the touch on an empty box', () => {
    renderComposer()
    expect(fireEvent.touchStart(message())).toBe(false)
  })

  it('leaves the touch to the WebView once there is text', () => {
    renderComposer()
    fireEvent.change(message(), { target: { value: 'typed' } })
    expect(fireEvent.touchStart(message())).toBe(true)
  })

  it('leaves a press that moves (a scroll) alone', async () => {
    renderComposer()
    touchBox()
    fireEvent.pointerMove(message(), {
      pointerId: 1,
      clientX: BOX.x,
      clientY: BOX.y - 20,
    })
    await waitPastLongPress()
    expect(overlay()).toBeNull()
    expect(started()).toBe(0)
  })

  it('leaves select and paste to the system once there is text', async () => {
    renderComposer()
    fireEvent.change(message(), { target: { value: 'typed' } })
    touchBox()
    await waitPastLongPress()
    expect(overlay()).toBeNull()
    expect(started()).toBe(0)
    expect(fireEvent.contextMenu(message())).toBe(true)
  })

  it('talks from an empty box while the keyboard is up, putting it away', async () => {
    renderComposer()
    message().focus()
    touchBox()
    await waitPastLongPress()
    await waitFor(() => expect(started()).toBeGreaterThan(0))
    expect(overlay()).not.toBeNull()
    expect(document.activeElement).not.toBe(message())
  })

  it('keeps the system menu off the box it takes the long press of', () => {
    renderComposer()
    expect(fireEvent.contextMenu(message())).toBe(false)
  })

  it('asks for setup instead of recording when no engine can run', async () => {
    onlyEngine('custom')
    renderComposer()
    touchBox()
    await waitPastLongPress()
    expect(
      await screen.findByText(
        'The custom endpoint needs a base URL and a model. Set them in voice settings.',
      ),
    ).toBeTruthy()
    expect(overlay()).toBeNull()
    expect(fake.speech.checkMicPermission).not.toHaveBeenCalled()
  })

  it('offers no long press without the native recorder', async () => {
    fake.available.value = false
    renderComposer()
    expect(message().hasAttribute('data-hold-to-talk')).toBe(false)
    touchBox()
    await waitPastLongPress()
    expect(started()).toBe(0)
  })
})

/** Slides up into the lock area and lets go: recording goes on. */
function lockUp(held = 200) {
  slide(LAYOUT.width / 2, LAYOUT.lockLine - 40)
  letGo(held)
}

const timer = () => screen.queryByRole('timer')?.textContent

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}
const hideApp = () => setVisibility('hidden')
const showApp = () => setVisibility('visible')

const INTERRUPTED =
  'Recording was interrupted. What you said is in the input box.'

describe('locked recording', () => {
  it('lights the lock hint when the finger slides up, with one haptic', async () => {
    useVoiceMode()
    renderComposer()
    await press()
    const hint = () => document.querySelector('.voice-hold-lock')
    expect(hint()?.textContent).toBe('Slide up to lock')
    expect(hint()?.getAttribute('data-active')).toBe('false')
    haptics.haptic.mockClear()
    slide(LAYOUT.width / 2, LAYOUT.lockLine - 40)
    expect(hint()?.getAttribute('data-active')).toBe('true')
    expect(status()).toBe('Release to keep recording')
    slide(LAYOUT.width / 2 + 30, LAYOUT.lockLine - 80)
    expect(
      haptics.haptic.mock.calls.filter(([kind]) => kind === 'selection'),
    ).toHaveLength(1)
    // Over a capsule the hint gives way to the capsule's own.
    slide(LAYOUT.edit.cx, LAYOUT.edit.cy)
    expect(hint()).toBeNull()
  })

  it('keeps recording after release in the lock area and shows the time', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(fake.speech.stopStream).not.toHaveBeenCalled()
    expect(fake.speech.cancelStream).not.toHaveBeenCalled()
    expect(overlay()).not.toBeNull()
    expect(status()).toBe('Recording hands-free')
    expect(timer()).toBe('00:00')
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(
      'Recorded 00:00',
    )
    expect(document.querySelector('.voice-hold-capsule')).toBeNull()
    for (const name of ['Cancel', 'To text', 'Send'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    heldFor += 65_000
    await waitFor(() => expect(timer()).toBe('01:05'))
    // The bar beneath takes no new press while locked.
    fireEvent.pointerDown(bar(), { button: 0, pointerId: 2 })
    expect(fake.speech.startStream).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('sends from the lock with Send', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await finishWith('locked and sent')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('locked and sent'))
    expect(onInsert).not.toHaveBeenCalled()
    expect(overlay()).toBeNull()
  })

  it('sends with Send even where release fills in (Herdr)', async () => {
    useVoiceMode('herdr')
    const { onSend } = renderComposer({ surface: 'herdr' })
    await press()
    lockUp()
    heldFor += 5000
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await finishWith('git log')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('git log'))
  })

  it('offers no Send where the composer cannot send', async () => {
    useVoiceMode()
    renderComposer({ onSend: undefined })
    await press()
    lockUp()
    expect(await screen.findByRole('button', { name: 'To text' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('puts the text in the composer with To text', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    fireEvent.click(await screen.findByRole('button', { name: 'To text' }))
    await finishWith('edit me')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('edit me', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('discards the recording with Cancel', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(overlay()).toBeNull())
    expect(fake.speech.cancelStream).toHaveBeenCalled()
    expect(fake.speech.stopStream).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('drops a lock ended before it was long enough to be speech', async () => {
    useVoiceMode()
    const { onSend } = renderComposer()
    await press()
    lockUp(100)
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await waitFor(() => expect(overlay()).toBeNull())
    expect(screen.getByRole('status').textContent).toBe(
      'Too short. Hold while you speak.',
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('stops into the composer when the app leaves the screen, never sending', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    await screen.findByRole('timer')
    act(() => hideApp())
    await finishWith('kept in the background')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('kept in the background', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Recording stopped when Alma left the screen. What you said is in the input box.',
    )
  })

  it('stops into the composer when the app leaves the screen mid-hold', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    act(() => hideApp())
    // The system taking the finger afterwards drops nothing.
    fireEvent.pointerCancel(bar(), { pointerId: 1 })
    letGo()
    await finishWith('a call came in')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('a call came in', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps a hold the system cancels before the page hides', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    heldFor += MIN_HOLD_MS
    // A call's screen takes the finger first; the page hides afterwards.
    fireEvent.pointerCancel(bar(), { pointerId: 1 })
    act(() => hideApp())
    await finishWith('the call took the finger')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith(
        'the call took the finger',
        'caret',
      ),
    )
    expect(onSend).not.toHaveBeenCalled()
    expect(fake.speech.cancelStream).not.toHaveBeenCalledBefore(
      fake.speech.stopStream,
    )
    expect(screen.getByRole('status').textContent).toBe(INTERRUPTED)
  })

  it('keeps the background notice until the user is back to read it', async () => {
    useVoiceMode()
    const { onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    await screen.findByRole('timer')
    act(() => hideApp())
    await finishWith('read me later')
    await waitFor(() => expect(onInsert).toHaveBeenCalled())
    const notice = () => screen.queryByRole('status')?.textContent
    vi.useFakeTimers()
    try {
      act(() => vi.advanceTimersByTime(NOTICE_MS * 3))
      expect(notice()).toBe(
        'Recording stopped when Alma left the screen. What you said is in the input box.',
      )
      act(() => showApp())
      act(() => vi.advanceTimersByTime(NOTICE_MS - 1))
      expect(notice()).toBeTruthy()
      act(() => vi.advanceTimersByTime(1))
      expect(notice()).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('swallows Back while the transcript is on its way', async () => {
    useVoiceMode()
    onlyEngine('openai')
    let answer: (value: { status: number; body: string }) => void = () => {}
    fake.speech.transcribe.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await waitFor(() => expect(status()).toBe('Transcribing…'))
    // Back is taken by the overlay, so the screen (and the dictation) stays.
    expect(closeTopOverlay()).toBe(true)
    expect(overlay()).not.toBeNull()
    expect(fake.speech.cancelRecording).not.toHaveBeenCalled()
    answer({ status: 200, body: '{"text":"still sent"}' })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('still sent'))
    expect(onInsert).not.toHaveBeenCalled()
    // Done: Back belongs to the screen again.
    expect(closeTopOverlay()).toBe(false)
  })

  it('keeps a locked batch recording whose mic fails', async () => {
    useVoiceMode()
    onlyEngine('openai')
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    await screen.findByRole('timer')
    act(() => fake.fire('recordingStopped', { reason: 'error' }))
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith('hi', 'caret'))
    expect(fake.speech.stopRecording).toHaveBeenCalled()
    expect(fake.speech.transcribe).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(INTERRUPTED)
  })

  it('stops into the composer on Back instead of leaving', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    await screen.findByRole('timer')
    act(() => void closeTopOverlay())
    await finishWith('back pressed')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('back pressed', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Recording stopped. What you said is in the input box.',
    )
  })

  it('says why when native stops a locked recording at the cap', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    await screen.findByRole('timer')
    act(() => fake.fire('recordingStopped', { reason: 'limit' }))
    await waitFor(() => expect(status()).toBe('Transcribing…'))
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    await finishWith('five whole minutes')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('five whole minutes', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Recording stopped at the 5-minute limit. What you said is in the input box.',
    )
  })

  it('warns before the cap and stops itself if native never does', async () => {
    useVoiceMode()
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += MAX_RECORDING_MS - 10_000
    await waitFor(() =>
      expect(status()).toBe('Stops in 10s at the 5-minute limit'),
    )
    expect(timer()).toBe('04:50')
    expect(fake.speech.stopStream).not.toHaveBeenCalled()
    heldFor += 10_000 + LIMIT_GRACE_MS
    await finishWith('ran long')
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('ran long', 'caret'),
    )
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(
      'Recording stopped at the 5-minute limit. What you said is in the input box.',
    )
  })

  it('sends a locked recording through an OpenAI-compatible upload', async () => {
    useVoiceMode()
    onlyEngine('openai')
    const { onSend } = renderComposer()
    await press()
    expect(fake.speech.startRecording).toHaveBeenCalled()
    lockUp()
    heldFor += 5000
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hi'))
    expect(fake.speech.stopRecording).toHaveBeenCalled()
    expect(fake.speech.transcribe).toHaveBeenCalledTimes(1)
  })

  it('keeps a backgrounded locked recording through the Soniox async job', async () => {
    useVoiceMode()
    onlyEngine('soniox-async')
    fake.speech.transcribe.mockImplementation(async () => ({
      status: 201,
      body: '{"id":"f1"}',
    }))
    fake.speech.request.mockImplementation(async ({ method }) => ({
      status: 200,
      body:
        method === 'POST'
          ? '{"id":"t1"}'
          : '{"status":"completed","text":"异步 锁定"}',
    }))
    const { onSend, onInsert } = renderComposer()
    await press()
    lockUp()
    heldFor += 5000
    await screen.findByRole('timer')
    act(() => hideApp())
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('异步 锁定', 'caret'),
    )
    expect(fake.speech.stopRecording).toHaveBeenCalled()
    expect(fake.speech.cancelRecording).not.toHaveBeenCalledBefore(
      fake.speech.transcribe,
    )
    expect(onSend).not.toHaveBeenCalled()
  })

  it('releases the mic when the composer goes away while locked', async () => {
    useVoiceMode()
    renderComposer()
    await press()
    lockUp()
    await screen.findByRole('timer')
    fake.speech.cancelStream.mockClear()
    fake.speech.cancelRecording.mockClear()
    cleanup()
    await waitFor(() => {
      expect(fake.speech.cancelStream).toHaveBeenCalled()
      expect(fake.speech.cancelRecording).toHaveBeenCalled()
    })
    expect(overlay()).toBeNull()
  })
})
