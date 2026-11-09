import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { useT } from '../i18n'
import type { DictationState } from './dictationSession'
import type { DictationErrorKind, EngineConfig } from './types'

/** Errors the user fixes in Settings → Voice input rather than by retrying. */
const SETTINGS_FIRST: ReadonlySet<DictationErrorKind> = new Set(['needs_key'])
/** Errors where a retry may work but Settings is the likelier fix. */
const SETTINGS_TOO: ReadonlySet<DictationErrorKind> = new Set([
  'auth',
  'bad_request',
  'host_not_allowed',
])

export function DictationSheet({
  state,
  engine,
  setupNeeded,
  onStop,
  onCancel,
  onRetry,
  onInsert,
}: {
  state: DictationState
  engine: EngineConfig
  /** The custom engine has no base URL or model yet; nothing was started. */
  setupNeeded?: boolean
  onStop(): void
  /** Abandons the dictation and closes the sheet; nothing is inserted. */
  onCancel(): void
  onRetry(): void
  /** Inserts recognised text the user chose to keep, then closes. */
  onInsert(text: string): void
}) {
  const t = useT()
  const navigate = useNavigate()
  const openSettings = () => {
    onCancel()
    navigate('/settings')
  }
  const engineLabel = engine.custom ? t('speech.engine.custom') : engine.label
  const realtime = engine.kind === 'soniox-rt'
  const error = setupNeeded
    ? { kind: 'setup' as const, detail: undefined, partial: '' }
    : state.phase === 'error'
      ? { ...state.error, partial: state.partial }
      : undefined

  const footer = error ? (
    <div className="dictation-actions">
      <button className="secondary" onClick={onCancel}>
        {t('common.cancel')}
      </button>
      {error.kind === 'setup' || SETTINGS_FIRST.has(error.kind) ? (
        <button className="primary" onClick={openSettings}>
          {t('speech.sheet.openSettings')}
        </button>
      ) : (
        <button className="primary" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  ) : (
    <div className="dictation-actions">
      <button className="secondary" onClick={onCancel}>
        {t('common.cancel')}
      </button>
      <button
        className="primary"
        disabled={state.phase !== 'recording'}
        onClick={onStop}
      >
        {t('speech.sheet.stop')}
      </button>
    </div>
  )

  return (
    <BottomSheet
      title={t('speech.sheet.title')}
      className="dictation-sheet"
      onClose={onCancel}
      footer={footer}
    >
      <div className="dictation-engine">
        <span className="dictation-engine-label">{engineLabel}</span>
        {engine.model ? (
          <span className="dictation-engine-model">{engine.model}</span>
        ) : null}
      </div>
      {error ? (
        <div className="dictation-error" role="alert">
          <p>
            {error.kind === 'setup'
              ? t('speech.errors.setup')
              : error.kind === 'needs_key'
                ? t('speech.errors.needs_key', { engine: engineLabel })
                : t(`speech.errors.${error.kind}`)}
          </p>
          {error.detail ? (
            <small className="dictation-error-detail">{error.detail}</small>
          ) : null}
          {error.kind !== 'setup' && SETTINGS_TOO.has(error.kind) ? (
            <button className="quiet-text-button" onClick={openSettings}>
              {t('speech.sheet.openSettings')}
            </button>
          ) : null}
          {error.partial ? (
            <button
              className="quiet-text-button"
              onClick={() => onInsert(error.partial)}
            >
              {t('speech.sheet.insertHeard')}
            </button>
          ) : null}
        </div>
      ) : (
        <Progress state={state} realtime={realtime} />
      )}
    </BottomSheet>
  )
}

function Progress({
  state,
  realtime,
}: {
  state: DictationState
  realtime: boolean
}) {
  const t = useT()
  const recording = state.phase === 'recording'
  const transcript =
    state.phase === 'recording' || state.phase === 'finishing'
      ? state.transcript
      : undefined
  const status =
    state.phase === 'recording'
      ? realtime
        ? undefined
        : t('speech.sheet.listening')
      : state.phase === 'finishing'
        ? realtime
          ? t('speech.sheet.finishing')
          : t('speech.sheet.transcribing')
        : t('speech.sheet.starting')
  const showPreview = realtime && transcript
  const empty = !transcript?.final && !transcript?.tail
  return (
    <div className="dictation-progress">
      <div className="dictation-meter-row">
        <LevelMeter level={recording ? state.level : 0} />
        <Elapsed startedAt={recording ? state.startedAt : undefined} />
      </div>
      {showPreview && !empty ? (
        <p className="dictation-preview" aria-live="polite">
          <span className="dictation-final">{transcript.final}</span>
          {transcript.tail ? (
            <span className="dictation-tail" data-final="false">
              {transcript.tail}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="dictation-status" aria-live="polite">
          {status ?? t('speech.sheet.speakNow')}
        </p>
      )}
      {showPreview && !empty && status ? (
        <p className="dictation-status">{status}</p>
      ) : null}
    </div>
  )
}

function LevelMeter({ level }: { level: number }) {
  const t = useT()
  // RMS of speech sits well below 1; the square root spreads it over the bar.
  const fill = Math.sqrt(Math.max(0, Math.min(1, level || 0)))
  return (
    <div
      className="dictation-level"
      role="meter"
      aria-label={t('speech.sheet.level')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill * 100)}
    >
      <span style={{ transform: `scaleX(${fill})` }} />
    </div>
  )
}

function Elapsed({ startedAt }: { startedAt?: number }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === undefined) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [startedAt])
  const seconds =
    startedAt === undefined
      ? 0
      : Math.max(0, Math.floor((now - startedAt) / 1000))
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <span className="dictation-elapsed" aria-label={t('speech.sheet.elapsed')}>
      {text}
    </span>
  )
}
