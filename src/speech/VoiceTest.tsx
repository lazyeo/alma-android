import { FlaskConical } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { SettingsRow } from '../components/SettingsRow'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { dictationErrorText } from './DictationSheet'
import {
  engineChain,
  engineReady,
  loadSpeechSettings,
  resolveEngine,
} from './engineStore'
import { transcriptText } from './soniox'
import { useDictation } from './useDictation'

/** Long enough for one short sentence, short enough to cost next to nothing. */
export const TEST_RECORD_MS = 3000

export interface VoiceTest {
  /** Tests the whole chain, or only one engine. */
  run(engineId?: string): void
  /** What the last run tested: an engine id, or undefined for the chain. */
  target?: string
  /** Is a run under way (or showing its result) for `target`? */
  busy: boolean
  /** The status line for the chain's Test row. */
  status: string
  /** The Test row for the whole chain. */
  row: ReactNode
  /** The result or error of the last run, shown under whatever started it. */
  output: ReactNode
}

/**
 * Settings → Voice input → Test: records a few seconds with the saved
 * engines, key and terms, then shows what came back. Nothing is inserted.
 */
export function useVoiceTest(): VoiceTest {
  const t = useT()
  const { state, engine, start, stop, cancel, reset } = useDictation()
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [target, setTarget] = useState<string>()
  const recording = state.phase === 'recording'

  useEffect(() => {
    if (!recording) return
    const timer = window.setTimeout(stop, TEST_RECORD_MS)
    return () => window.clearTimeout(timer)
  }, [recording, stop])
  useEffect(() => () => cancel(), [cancel])

  const run = (engineId?: string) => {
    if (state.phase === 'starting' || state.phase === 'finishing') return
    void haptic('light')
    if (recording) return stop()
    reset()
    const settings = loadSpeechSettings()
    const ready = engineId
      ? engineReady(resolveEngine(settings, engineId))
      : engineChain(settings).length > 0
    setTarget(engineId)
    setSetupNeeded(!ready)
    if (ready) start(engineId)
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
      onClick={() => run()}
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
  const busy =
    state.phase === 'starting' ||
    state.phase === 'recording' ||
    state.phase === 'finishing'
  return { run, target, busy, status, row, output }
}
