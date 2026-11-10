import { FlaskConical } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { SettingsRow } from '../components/SettingsRow'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { dictationErrorText } from './DictationSheet'
import { engineChain, loadSpeechSettings } from './engineStore'
import { transcriptText } from './soniox'
import { useDictation } from './useDictation'

/** Long enough for one short sentence, short enough to cost next to nothing. */
export const TEST_RECORD_MS = 3000

/**
 * Settings → Voice input → Test: records a few seconds with the saved
 * engine, key and terms, then shows what came back. Nothing is inserted.
 * Returns the row (for the settings group) and its output (shown below it).
 */
export function useVoiceTest(): { row: ReactNode; output: ReactNode } {
  const t = useT()
  const { state, engine, start, stop, cancel, reset } = useDictation()
  const [setupNeeded, setSetupNeeded] = useState(false)
  const recording = state.phase === 'recording'

  useEffect(() => {
    if (!recording) return
    const timer = window.setTimeout(stop, TEST_RECORD_MS)
    return () => window.clearTimeout(timer)
  }, [recording, stop])
  useEffect(() => () => cancel(), [cancel])

  const run = () => {
    if (state.phase === 'starting' || state.phase === 'finishing') return
    void haptic('light')
    if (recording) return stop()
    reset()
    const ready = engineChain(loadSpeechSettings()).length > 0
    setSetupNeeded(!ready)
    if (ready) start()
  }

  const engineLabel = engine.custom ? t('speech.engine.custom') : engine.label
  const status =
    state.phase === 'starting'
      ? t('speech.sheet.starting')
      : state.phase === 'recording'
        ? t('speech.settings.test.recording', {
            seconds: TEST_RECORD_MS / 1000,
          })
        : state.phase === 'finishing'
          ? t('speech.sheet.transcribing')
          : t('speech.settings.test.hint', { seconds: TEST_RECORD_MS / 1000 })
  const heard =
    state.phase === 'recording' && transcriptText(state.transcript)
      ? transcriptText(state.transcript)
      : ''
  const error = setupNeeded
    ? dictationErrorText(t, 'setup', engineLabel)
    : state.phase === 'error'
      ? dictationErrorText(t, state.error.kind, engineLabel)
      : ''
  const detail = state.phase === 'error' ? state.error.detail : undefined

  const row = (
    <SettingsRow
      icon={<FlaskConical size={17} />}
      title={t('speech.settings.test.title')}
      secondary={status}
      onClick={run}
    />
  )
  const output = (
    <>
      {state.phase === 'done' || heard ? (
        <p className="voice-test-result" aria-live="polite">
          <span className="voice-test-label">
            {t('speech.settings.test.result')}
          </span>
          <span>{state.phase === 'done' ? state.text : heard}</span>
        </p>
      ) : null}
      {error ? (
        <p className="voice-test-error" role="alert">
          {error}
          {detail ? (
            <small className="dictation-error-detail">{detail}</small>
          ) : null}
        </p>
      ) : null}
    </>
  )
  return { row, output }
}
