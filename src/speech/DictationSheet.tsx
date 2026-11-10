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

/** The user-facing copy for a failed (or unconfigured) dictation. */
export function dictationErrorText(
  t: ReturnType<typeof useT>,
  kind: DictationErrorKind | 'setup',
  engineLabel: string,
): string {
  if (kind === 'setup') return t('speech.errors.setup')
  if (kind === 'needs_key')
    return t('speech.errors.needs_key', { engine: engineLabel })
  return t(`speech.errors.${kind}`)
}

/**
 * Why a dictation could not finish, and what to do about it. Recording
 * itself happens in the hold overlay; this sheet only opens on failure.
 */
export function DictationSheet({
  state,
  engine: primary,
  setupNeeded,
  onClose,
  onInsert,
}: {
  state: DictationState
  /** The primary engine, named until the session reports the active one. */
  engine: EngineConfig
  /** No enabled engine can run (e.g. only an unconfigured Custom). */
  setupNeeded?: boolean
  onClose(): void
  /** Inserts recognised text the user chose to keep, then closes. */
  onInsert(text: string): void
}) {
  const t = useT()
  const navigate = useNavigate()
  const openSettings = () => {
    onClose()
    navigate('/settings')
  }
  const engine = ('engine' in state && state.engine) || primary
  const label = (item: EngineConfig) =>
    item.custom ? t('speech.engine.custom') : item.label
  const engineLabel = label(engine)
  const fallback = 'fallback' in state ? state.fallback : undefined
  const error = setupNeeded
    ? { kind: 'setup' as const, detail: undefined, partial: '' }
    : state.phase === 'error'
      ? { ...state.error, partial: state.partial }
      : undefined
  if (!error) return null
  const settingsFirst = error.kind === 'setup' || SETTINGS_FIRST.has(error.kind)

  return (
    <BottomSheet
      title={t('speech.sheet.title')}
      className="dictation-sheet"
      onClose={onClose}
      footer={
        <div className="dictation-actions">
          <button
            className={settingsFirst ? 'secondary' : 'primary'}
            onClick={onClose}
          >
            {t('common.close')}
          </button>
          {settingsFirst ? (
            <button className="primary" onClick={openSettings}>
              {t('speech.sheet.openSettings')}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="dictation-engine">
        <span className="dictation-engine-label">{engineLabel}</span>
        {engine.model ? (
          <span className="dictation-engine-model">{engine.model}</span>
        ) : null}
      </div>
      {fallback ? (
        <p className="dictation-fallback">
          {t(`speech.sheet.fallback.${fallback.reason}`, {
            from: label(fallback.from),
            to: label(fallback.to),
          })}
        </p>
      ) : null}
      <div className="dictation-error" role="alert">
        <p>{dictationErrorText(t, error.kind, engineLabel)}</p>
        {error.detail ? (
          <small className="dictation-error-detail">{error.detail}</small>
        ) : null}
        {!settingsFirst && SETTINGS_TOO.has(error.kind) ? (
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
    </BottomSheet>
  )
}
