import {
  AudioLines,
  ChevronRight,
  KeyRound,
  ListChecks,
  Mic,
  Server,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { OptionRow } from '../components/Composer'
import { SettingsRow } from '../components/SettingsRow'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  loadSpeechSettings,
  resolveEngine,
  saveSpeechSettings,
  type SpeechSettings,
} from '../speech/engineStore'
import {
  Speech,
  speechAvailable,
  type KeyStatus,
  type MicPermission,
} from '../speech/nativeSpeech'
import { PRESETS, validBaseUrl } from '../speech/presets'
import { DEFAULT_TERMS, formatTerms, parseTerms } from '../speech/terms'
import type { EngineConfig } from '../speech/types'

type Sheet = 'engine' | 'key' | 'model' | 'custom' | 'terms'

/** Settings → Voice input. Hidden where there is no native recorder. */
export function VoiceSettings() {
  return speechAvailable() ? <VoiceSettingsSection /> : null
}

function VoiceSettingsSection() {
  const t = useT()
  const [settings, setSettings] = useState(loadSpeechSettings)
  const [sheet, setSheet] = useState<Sheet>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>()
  const [mic, setMic] = useState<MicPermission>()
  const engine = resolveEngine(settings)
  const engineName = (candidate: EngineConfig) =>
    candidate.custom ? t('speech.engine.custom') : candidate.label

  useEffect(() => {
    let current = true
    setKeyStatus(undefined)
    Speech.keyStatus({ engineId: engine.id })
      .then((status) => current && setKeyStatus(status))
      .catch(() => current && setError(t('speech.settings.key.statusFailed')))
    return () => {
      current = false
    }
  }, [engine.id, t])

  useEffect(() => {
    let current = true
    Speech.checkMicPermission()
      .then(({ mic }) => current && setMic(mic))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  const persist = (next: SpeechSettings) => {
    try {
      saveSpeechSettings(next)
    } catch {
      setError(t('speech.settings.saveFailed'))
      return false
    }
    setSettings(next)
    setError('')
    return true
  }
  const pick = (next: SpeechSettings) => {
    void haptic('selection')
    setSheet(undefined)
    persist(next)
  }
  const chevron = <ChevronRight className="settings-chevron" size={16} />
  const value = (text: string) => (
    <span className="desktop-row-trailing">
      <span className="settings-value">{text}</span>
      {chevron}
    </span>
  )

  return (
    <section className="settings-section" aria-labelledby="voice-heading">
      <h2 id="voice-heading" className="settings-section-title">
        {t('speech.settings.title')}
      </h2>
      <p className="settings-section-note">{t('speech.settings.note')}</p>
      <div className="settings-group">
        <SettingsRow
          icon={<AudioLines size={17} />}
          title={t('speech.settings.engine')}
          onClick={() => {
            void haptic('selection')
            setSheet('engine')
          }}
          trailing={value(engineName(engine))}
        />
        {engine.custom ? (
          <SettingsRow
            icon={<Server size={17} />}
            title={t('speech.settings.custom.title')}
            secondary={
              engine.baseUrl
                ? hostOf(engine.baseUrl)
                : t('speech.settings.custom.notSet')
            }
            onClick={() => {
              void haptic('selection')
              setNotice('')
              setSheet('custom')
            }}
            trailing={chevron}
          />
        ) : null}
        <SettingsRow
          icon={<KeyRound size={17} />}
          title={t('speech.settings.key.title')}
          onClick={() => {
            void haptic('selection')
            setSheet('key')
          }}
          trailing={
            <span className="desktop-row-trailing">
              {keyStatus ? (
                <span className="voice-key-status">
                  <span className="settings-value">
                    {keyStatus.set
                      ? t('speech.settings.key.set')
                      : t('speech.settings.key.notSet')}
                  </span>
                  {keyStatus.set && keyStatus.last4 ? (
                    <span className="settings-value voice-key-last4">
                      {'••••'}
                      {keyStatus.last4}
                    </span>
                  ) : null}
                </span>
              ) : null}
              {chevron}
            </span>
          }
        />
        {!engine.custom && engine.models.length > 1 ? (
          <SettingsRow
            icon={<SlidersHorizontal size={17} />}
            title={t('speech.settings.model')}
            onClick={() => {
              void haptic('selection')
              setSheet('model')
            }}
            trailing={value(engine.model)}
          />
        ) : null}
        <SettingsRow
          icon={<ListChecks size={17} />}
          title={t('speech.settings.terms.title')}
          secondary={t('speech.settings.terms.count', {
            count: settings.terms.length,
          })}
          onClick={() => {
            void haptic('selection')
            setSheet('terms')
          }}
          trailing={chevron}
        />
        {mic && mic !== 'granted' ? (
          <SettingsRow
            icon={<Mic size={17} />}
            title={t('speech.settings.mic.title')}
            secondary={
              mic === 'denied'
                ? t('speech.settings.mic.denied')
                : t('speech.settings.mic.hint')
            }
            onClick={() => {
              void haptic('light')
              Speech.requestMicPermission()
                .then(({ mic }) => setMic(mic))
                .catch(() => setError(t('speech.settings.mic.failed')))
            }}
            trailing={chevron}
          />
        ) : null}
      </div>
      {error ? <p className="settings-error">{error}</p> : null}
      {notice ? <p className="settings-section-note">{notice}</p> : null}

      {sheet === 'engine' ? (
        <BottomSheet
          title={t('speech.settings.engine')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {PRESETS.map((preset) => {
              const resolved = resolveEngine(settings, preset.id)
              return (
                <OptionRow
                  key={preset.id}
                  label={engineName(preset)}
                  detail={resolved.model || undefined}
                  selected={preset.id === engine.id}
                  onClick={() => pick({ ...settings, engineId: preset.id })}
                />
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'model' ? (
        <BottomSheet
          title={t('speech.settings.model')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {engine.models.map((model) => (
              <OptionRow
                key={model}
                label={model}
                selected={model === engine.model}
                onClick={() =>
                  pick({
                    ...settings,
                    models: { ...settings.models, [engine.id]: model },
                  })
                }
              />
            ))}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'key' ? (
        <KeySheet
          engine={engine}
          engineName={engineName(engine)}
          status={keyStatus}
          onClose={() => setSheet(undefined)}
          onStatus={setKeyStatus}
        />
      ) : null}
      {sheet === 'custom' ? (
        <CustomEndpointSheet
          settings={settings}
          onClose={() => setSheet(undefined)}
          onSave={async (custom) => {
            const changed =
              custom.baseUrl !== settings.custom.baseUrl.trim() &&
              Boolean(settings.custom.baseUrl.trim())
            // A key is bound to the host it was saved for; a new host needs
            // the user to enter (and so re-bind) the key deliberately.
            if (changed && keyStatus?.set !== false) {
              try {
                await Speech.deleteKey({ engineId: 'custom' })
              } catch {
                return t('speech.settings.key.deleteFailed')
              }
              setKeyStatus({ set: false })
              setNotice(
                keyStatus?.set ? t('speech.settings.custom.keyCleared') : '',
              )
            }
            if (!persist({ ...settings, custom }))
              return t('speech.settings.saveFailed')
            void haptic('light')
            setSheet(undefined)
            return ''
          }}
        />
      ) : null}
      {sheet === 'terms' ? (
        <TermsSheet
          terms={settings.terms}
          onClose={() => setSheet(undefined)}
          onSave={(terms) => {
            if (!persist({ ...settings, terms }))
              return t('speech.settings.saveFailed')
            void haptic('light')
            setSheet(undefined)
            return ''
          }}
        />
      ) : null}
    </section>
  )
}

/**
 * The typed key lives only in this sheet's state and goes straight to the
 * native key store; it is never written to any JS storage.
 */
function KeySheet({
  engine,
  engineName,
  status,
  onClose,
  onStatus,
}: {
  engine: EngineConfig
  engineName: string
  status?: KeyStatus
  onClose(): void
  onStatus(status: KeyStatus): void
}) {
  const t = useT()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Clear the draft however the sheet goes away.
  useEffect(() => () => setKey(''), [])
  const save = async () => {
    const typed = key.trim()
    if (!typed) return
    setBusy(true)
    try {
      await Speech.setKey({
        engineId: engine.id,
        key: typed,
        boundUrl: engine.baseUrl,
      })
      setKey('')
      void haptic('light')
      onStatus(await Speech.keyStatus({ engineId: engine.id }))
      onClose()
    } catch {
      setError(t('speech.settings.key.saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await Speech.deleteKey({ engineId: engine.id })
      void haptic('light')
      onStatus({ set: false })
      onClose()
    } catch {
      setError(t('speech.settings.key.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }
  const host = hostOf(engine.baseUrl)
  return (
    <BottomSheet
      title={t('speech.settings.key.sheetTitle', { engine: engineName })}
      onClose={() => {
        setKey('')
        onClose()
      }}
      footer={
        <button
          className="primary voice-sheet-primary"
          disabled={busy || !key.trim() || !engine.baseUrl}
          onClick={() => void save()}
        >
          {t('common.save')}
        </button>
      }
    >
      <form
        className="voice-form"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label>
          {t('speech.settings.key.label')}
          <input
            autoFocus
            className="rename-input"
            type="password"
            name="speech-api-key"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        {host ? (
          <p className="settings-section-note">
            {t('speech.settings.key.hint', { host })}
          </p>
        ) : null}
      </form>
      {error ? <p className="settings-error">{error}</p> : null}
      {status?.set ? (
        <div className="sheet-list voice-sheet-actions">
          <button
            className="sheet-row danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 size={18} />
            <span className="sheet-row-copy">
              <span>{t('speech.settings.key.delete')}</span>
            </span>
          </button>
        </div>
      ) : null}
    </BottomSheet>
  )
}

function CustomEndpointSheet({
  settings,
  onClose,
  onSave,
}: {
  settings: SpeechSettings
  onClose(): void
  /** Resolves to an error message, or '' once saved. */
  onSave(custom: SpeechSettings['custom']): Promise<string>
}) {
  const t = useT()
  const [baseUrl, setBaseUrl] = useState(settings.custom.baseUrl)
  const [model, setModel] = useState(settings.custom.model)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trimmedUrl = baseUrl.trim().replace(/\/+$/, '')
  const urlValid = validBaseUrl(trimmedUrl)
  const save = async () => {
    if (!urlValid || !model.trim()) return
    setBusy(true)
    const message = await onSave({ baseUrl: trimmedUrl, model: model.trim() })
    setBusy(false)
    setError(message)
  }
  return (
    <BottomSheet
      title={t('speech.settings.custom.title')}
      onClose={onClose}
      footer={
        <button
          className="primary voice-sheet-primary"
          disabled={busy || !urlValid || !model.trim()}
          onClick={() => void save()}
        >
          {t('common.save')}
        </button>
      }
    >
      <form
        className="voice-form"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <p className="settings-section-note">
          {t('speech.settings.custom.hint')}
        </p>
        <label>
          {t('speech.settings.custom.baseUrl')}
          <input
            autoFocus
            className="rename-input"
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('speech.settings.custom.baseUrlPlaceholder')}
            value={baseUrl}
            aria-invalid={Boolean(baseUrl.trim()) && !urlValid}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        {baseUrl.trim() && !urlValid ? (
          <p className="settings-error">
            {t('speech.settings.custom.invalidUrl')}
          </p>
        ) : null}
        <label>
          {t('speech.settings.custom.model')}
          <input
            className="rename-input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('speech.settings.custom.modelPlaceholder')}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
      </form>
      {error ? <p className="settings-error">{error}</p> : null}
    </BottomSheet>
  )
}

function TermsSheet({
  terms,
  onClose,
  onSave,
}: {
  terms: readonly string[]
  onClose(): void
  /** Returns an error message, or '' once saved. */
  onSave(terms: string[]): string
}) {
  const t = useT()
  const [text, setText] = useState(() => formatTerms(terms))
  const [error, setError] = useState('')
  return (
    <BottomSheet
      title={t('speech.settings.terms.title')}
      onClose={onClose}
      footer={
        <button
          className="primary voice-sheet-primary"
          onClick={() => setError(onSave(parseTerms(text)))}
        >
          {t('common.save')}
        </button>
      }
    >
      <div className="voice-form">
        <p className="settings-section-note">
          {t('speech.settings.terms.hint')}
        </p>
        <label>
          {t('speech.settings.terms.label')}
          <textarea
            className="rename-input voice-terms-input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="quiet-text-button"
          onClick={() => {
            void haptic('selection')
            setText(formatTerms(DEFAULT_TERMS))
          }}
        >
          {t('speech.settings.terms.reset')}
        </button>
      </div>
      {error ? <p className="settings-error">{error}</p> : null}
    </BottomSheet>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
