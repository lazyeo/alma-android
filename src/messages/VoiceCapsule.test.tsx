// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageVoice, VoiceCapsule } from './VoiceCapsule'
import type { VoiceNote } from './voiceNote'

vi.mock('../screens/LoadingOrbCanvas', () => ({
  LoadingOrb: () => <i data-testid="orb" />,
}))

const voice: VoiceNote = {
  path: '/api/gallery/cache/a.m4a',
  mediaType: 'audio/mp4',
  durationMs: 65_000,
  waveform: [0.2, 0.8, 0.4, 1],
}

// jsdom has no media pipeline; model just the events the capsule reacts to.
let playImpl: (element: HTMLMediaElement) => Promise<void>
beforeEach(() => {
  playImpl = async (element) => {
    element.dispatchEvent(new Event('play'))
  }
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return playImpl(this)
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('pause'))
  })
  URL.createObjectURL = vi.fn(() => 'blob:voice')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const audioBlob = () => new Blob([new Uint8Array([1])], { type: 'audio/mp4' })

describe('VoiceCapsule', () => {
  it('shows the length and waveform before anything is fetched', () => {
    const load = vi.fn()
    const view = render(<VoiceCapsule voice={voice} load={load} />)
    expect(view.getByText('1:05')).toBeTruthy()
    expect(view.container.querySelectorAll('.voice-capsule-bar')).toHaveLength(
      4,
    )
    expect(
      screen.getByRole('progressbar', { name: 'Voice message' }),
    ).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })

  it('fetches on the first tap, plays, then pauses', async () => {
    const load = vi.fn().mockResolvedValue(audioBlob())
    render(<VoiceCapsule voice={voice} load={load} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    await screen.findByRole('button', { name: 'Pause voice message' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(document.querySelector('audio')?.getAttribute('src')).toBe(
      'blob:voice',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    await screen.findByRole('button', { name: 'Pause voice message' })
    // The second play reuses the downloaded bytes.
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('tracks progress against the known length', async () => {
    const load = vi.fn().mockResolvedValue(audioBlob())
    const view = render(<VoiceCapsule voice={voice} load={load} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    await screen.findByRole('button', { name: 'Pause voice message' })
    const audio = view.container.querySelector('audio')!
    Object.defineProperty(audio, 'currentTime', {
      value: 33,
      configurable: true,
    })
    fireEvent.timeUpdate(audio)
    expect(view.getByText('0:33')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
      '0:33 of 1:05',
    )
    expect(
      view.container.querySelectorAll('.voice-capsule-bar[data-played]'),
    ).toHaveLength(2)
  })

  it('uses the decoded length when the desktop sent none', async () => {
    const load = vi.fn().mockResolvedValue(audioBlob())
    const view = render(
      <VoiceCapsule
        voice={{ ...voice, durationMs: 0, waveform: [] }}
        load={load}
      />,
    )
    expect(view.container.querySelector('.voice-capsule-time')).toBeNull()
    expect(view.container.querySelector('.voice-capsule-line')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    await screen.findByRole('button', { name: 'Pause voice message' })
    const audio = view.container.querySelector('audio')!
    Object.defineProperty(audio, 'duration', { value: 12, configurable: true })
    fireEvent.loadedMetadata(audio)
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' }))
    fireEvent.ended(audio)
    expect(view.getByText('0:12')).toBeTruthy()
  })

  it('offers a retry when the download fails, and fetches again', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('Audio unavailable'))
      .mockResolvedValue(audioBlob())
    render(<VoiceCapsule voice={voice} load={load} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    const retry = await screen.findByRole('button', {
      name: "Couldn't load the voice message. Tap to retry.",
    })
    fireEvent.click(retry)
    await screen.findByRole('button', { name: 'Pause voice message' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reports a playback the WebView refuses', async () => {
    playImpl = () => Promise.reject(new Error('NotSupportedError'))
    render(
      <VoiceCapsule
        voice={voice}
        load={vi.fn().mockResolvedValue(audioBlob())}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    expect(
      await screen.findByText("Couldn't load the voice message. Tap to retry."),
    ).toBeTruthy()
  })

  it('plays one voice at a time', async () => {
    const load = () => Promise.resolve(audioBlob())
    const view = render(
      <>
        <VoiceCapsule voice={voice} load={load} />
        <VoiceCapsule voice={{ ...voice, path: '/b' }} load={load} />
      </>,
    )
    const [first, second] = screen.getAllByRole('button', {
      name: 'Play voice message',
    })
    fireEvent.click(first)
    await screen.findByRole('button', { name: 'Pause voice message' })
    fireEvent.click(second)
    await waitFor(() =>
      expect(
        view.container.querySelectorAll('[data-status="playing"]'),
      ).toHaveLength(1),
    )
    expect(
      view.container
        .querySelectorAll('.voice-capsule')[0]
        .getAttribute('data-status'),
    ).toBe('paused')
  })

  it('stops when the thread unmounts it or the app is hidden', async () => {
    const load = vi.fn().mockResolvedValue(audioBlob())
    const view = render(<VoiceCapsule voice={voice} load={load} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    await screen.findByRole('button', { name: 'Pause voice message' })
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(pause).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Play voice message' }),
    ).toBeTruthy()

    pause.mockClear()
    view.unmount()
    expect(pause).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice')
  })

  it('drops a download that finishes after the thread was left', async () => {
    let resolve!: (blob: Blob) => void
    const load = vi.fn(() => new Promise<Blob>((done) => (resolve = done)))
    const view = render(<VoiceCapsule voice={voice} load={load} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    view.unmount()
    await act(async () => resolve(audioBlob()))
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })
})

describe('MessageVoice', () => {
  const renderVoice = (note: VoiceNote) => <span>player {note.path}</span>

  it('renders nothing for rows without a voice', () => {
    const view = render(
      <MessageVoice metadata={{}} renderVoice={renderVoice} />,
    )
    expect(view.container.innerHTML).toBe('')
  })

  it("hands a playable voice to the host's player", () => {
    render(
      <MessageVoice
        metadata={{ voice: { url: '/api/gallery/cache/a.m4a' } }}
        renderVoice={renderVoice}
      />,
    )
    expect(screen.getByText('player /api/gallery/cache/a.m4a')).toBeTruthy()
  })

  it('falls back to the placeholder for bad voices or hosts without a player', () => {
    const view = render(
      <MessageVoice
        metadata={{ voice: { url: 'https://example.com/a.m4a' } }}
        renderVoice={renderVoice}
      />,
    )
    expect(view.getByText("Voice message (can't be played)")).toBeTruthy()
    view.unmount()
    render(
      <MessageVoice
        metadata={{ voice: { url: '/api/gallery/cache/a.m4a' } }}
      />,
    )
    expect(screen.getByText("Voice message (can't be played)")).toBeTruthy()
  })
})
