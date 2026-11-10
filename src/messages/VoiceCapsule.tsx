import { Pause, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { LoadingOrb } from '../screens/LoadingOrbCanvas'
import { useObjectUrl } from '../screens/useObjectUrl'
import { VoiceUnavailable } from './PartView'
import { formatVoiceClock, parseVoiceNote, type VoiceNote } from './voiceNote'

type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'failed'

// One voice plays at a time across the app, like any messenger.
let playingElement: HTMLAudioElement | null = null

/**
 * The row-level voice slot: nothing for ordinary rows, a placeholder when
 * the voice cannot be played here, otherwise the host's player.
 */
export function MessageVoice({
  metadata,
  renderVoice,
}: {
  metadata: unknown
  renderVoice?: (voice: VoiceNote) => ReactNode
}) {
  const state = parseVoiceNote(metadata)
  if (state.kind === 'none') return null
  if (state.kind === 'unsupported' || !renderVoice) return <VoiceUnavailable />
  return <>{renderVoice(state.voice)}</>
}

/**
 * Play/pause, progress and length for one voice note. Audio is fetched only
 * on the first tap, through `load`, and played from a local object URL so
 * relay mode never touches a desktop-local address.
 */
export function VoiceCapsule({
  voice,
  load,
}: {
  voice: VoiceNote
  load: () => Promise<Blob>
}) {
  const t = useT()
  const audioRef = useRef<HTMLAudioElement>(null)
  const mounted = useRef(true)
  const playWhenReady = useRef(false)
  const [blob, setBlob] = useState<Blob>()
  const src = useObjectUrl(blob)
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [decodedMs, setDecodedMs] = useState(0)
  const durationMs = voice.durationMs || decodedMs

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {
      if (mounted.current) setStatus('failed')
    })
  }, [])

  // Leaving the thread unmounts the capsule; never let audio outlive it.
  useEffect(() => {
    mounted.current = true
    const element = audioRef.current
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden') element?.pause()
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', pauseWhenHidden)
      element?.pause()
      if (playingElement === element) playingElement = null
    }
  }, [])

  useEffect(() => {
    if (src && playWhenReady.current) {
      playWhenReady.current = false
      play()
    }
  }, [src, play])

  const toggle = () => {
    if (status === 'playing') {
      audioRef.current?.pause()
      return
    }
    // A failed tap starts over with fresh bytes; the old ones may be bad.
    if (blob && status !== 'failed') {
      play()
      return
    }
    setBlob(undefined)
    setStatus('loading')
    playWhenReady.current = true
    load().then(
      (loaded) => {
        if (mounted.current) setBlob(loaded)
      },
      () => {
        playWhenReady.current = false
        if (mounted.current) setStatus('failed')
      },
    )
  }

  const fraction = durationMs ? Math.min(1, elapsedMs / durationMs) : 0
  const started = status === 'playing' || status === 'paused'
  const label =
    status === 'playing'
      ? t('message.voice.pause')
      : status === 'loading'
        ? t('message.voice.loading')
        : status === 'failed'
          ? t('message.voice.failed')
          : t('message.voice.play')
  return (
    <div className="voice-capsule" data-status={status}>
      <button
        type="button"
        className="voice-capsule-toggle"
        aria-label={label}
        disabled={status === 'loading'}
        onClick={toggle}
      >
        {status === 'loading' ? (
          <LoadingOrb size={16} />
        ) : status === 'playing' ? (
          <Pause size={16} aria-hidden />
        ) : status === 'failed' ? (
          <RotateCcw size={16} aria-hidden />
        ) : (
          <Play size={16} aria-hidden />
        )}
      </button>
      <div
        className="voice-capsule-track"
        role="progressbar"
        aria-label={t('message.voice.label')}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(elapsedMs / 1000)}
        aria-valuetext={t('message.voice.progress', {
          elapsed: formatVoiceClock(elapsedMs),
          total: formatVoiceClock(durationMs),
        })}
      >
        {voice.waveform.length ? (
          voice.waveform.map((level, index) => (
            <span
              key={index}
              className="voice-capsule-bar"
              data-played={
                // A bar lights once playback passes its middle.
                (index + 0.5) / voice.waveform.length < fraction
                  ? ''
                  : undefined
              }
              // Bars stay visible at silence so the capsule keeps its shape.
              style={{ height: `${Math.round(4 + level * 18)}px` }}
            />
          ))
        ) : (
          <span className="voice-capsule-line">
            <span style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        )}
      </div>
      {status === 'failed' ? (
        <span className="voice-capsule-error">{t('message.voice.failed')}</span>
      ) : durationMs || started ? (
        <time className="voice-capsule-time">
          {formatVoiceClock(started ? elapsedMs : durationMs)}
        </time>
      ) : null}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={(event) => {
          const element = event.currentTarget
          if (playingElement && playingElement !== element)
            playingElement.pause()
          playingElement = element
          setStatus('playing')
        }}
        onPause={(event) => {
          if (playingElement === event.currentTarget) playingElement = null
          if (!event.currentTarget.ended) setStatus('paused')
        }}
        onEnded={() => {
          setStatus('idle')
          setElapsedMs(0)
        }}
        onTimeUpdate={(event) =>
          setElapsedMs(event.currentTarget.currentTime * 1000)
        }
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds)) setDecodedMs(seconds * 1000)
        }}
        onError={() => {
          if (src) setStatus('failed')
        }}
      />
    </div>
  )
}
