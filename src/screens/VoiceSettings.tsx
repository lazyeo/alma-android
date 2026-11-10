import {
  AudioLines,
  ChevronRight,
  GripVertical,
  KeyRound,
  ListChecks,
  Mic,
  Send,
  Server,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { OptionRow } from '../components/Composer'
import { SettingsRow } from '../components/SettingsRow'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  engineEnabled,
  engineReady,
  loadSpeechSettings,
  moveEngine,
  primaryEngineId,
  resolveEngine,
  saveSpeechSettings,
  setEngineEnabled,
  type DictationSurface,
  type ReleaseAction,
  type SpeechSettings,
} from '../speech/engineStore'
import {
  Speech,
  speechAvailable,
  type KeyStatus,
  type MicPermission,
} from '../speech/nativeSpeech'
import { keyIdOf, keyUrlsOf, PRESETS, validBaseUrl } from '../speech/presets'
import { DEFAULT_TERMS, formatTerms, parseTerms } from '../speech/terms'
import type { EngineConfig } from '../speech/types'
import { useVoiceTest } from '../speech/VoiceTest'

/** Sheets that configure one engine carry which one. */
type Sheet =
  | { kind: 'engines' }
  | { kind: 'engine' | 'key' | 'model' | 'custom'; id: string }
  | { kind: 'terms' }
  | { kind: 'release'; surface: DictationSurface }

/** Unique key ids, so the shared Soniox key is asked for once. */
const KEY_IDS = [...new Set(PRESETS.map(keyIdOf))]

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
  /** Per key id; missing while loading. */
  const [keys, setKeys] = useState<Record<string, KeyStatus>>({})
  const [mic, setMic] = useState<MicPermission>()
  const test = useVoiceTest()
  const engine = resolveEngine(settings)
  const target =
    sheet && 'id' in sheet ? resolveEngine(settings, sheet.id) : engine
  const keyOf = (candidate: EngineConfig) => keys[keyIdOf(candidate)]
  const setKeyStatus = (candidate: EngineConfig, status: KeyStatus) =>
    setKeys((current) => ({ ...current, [keyIdOf(candidate)]: status }))
  const engineName = (candidate: EngineConfig) =>
    candidate.custom ? t('speech.engine.custom') : candidate.label

  useEffect(() => {
    let current = true
    for (const keyId of KEY_IDS)
      Speech.keyStatus({ engineId: keyId })
        .then(
          (status) =>
            current && setKeys((known) => ({ ...known, [keyId]: status })),
        )
        .catch(() => current && setError(t('speech.settings.key.statusFailed')))
    return () => {
      current = false
    }
  }, [t])

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
  const open = (next: Sheet) => {
    void haptic('selection')
    setNotice('')
    setSheet(next)
  }
  const chevron = <ChevronRight className="settings-chevron" size={16} />
  const value = (text: string) => (
    <span className="desktop-row-trailing">
      <span className="settings-value">{text}</span>
      {chevron}
    </span>
  )
  const keyTrailing = (status?: KeyStatus) => (
    <span className="desktop-row-trailing">
      {status ? (
        <span className="voice-key-status">
          <span className="settings-value">
            {status.set
              ? t('speech.settings.key.set')
              : t('speech.settings.key.notSet')}
          </span>
          {status.set && status.last4 ? (
            <span className="settings-value voice-key-last4">
              {'••••'}
              {status.last4}
            </span>
          ) : null}
        </span>
      ) : null}
      {chevron}
    </span>
  )
  const enabledChain = settings.order
    .filter((id) => engineEnabled(settings, id))
    .map((id) => engineName(resolveEngine(settings, id)))
  const releaseLabel = (action: ReleaseAction) =>
    t(`speech.settings.release.${action}`)
  /** Rows that configure one engine: endpoint, key and model. */
  const engineRows = (candidate: EngineConfig) => (
    <>
      {candidate.custom ? (
        <SettingsRow
          icon={<Server size={17} />}
          title={t('speech.settings.custom.title')}
          secondary={
            candidate.baseUrl
              ? hostOf(candidate.baseUrl)
              : t('speech.settings.custom.notSet')
          }
          onClick={() => open({ kind: 'custom', id: candidate.id })}
          trailing={chevron}
        />
      ) : null}
      <SettingsRow
        icon={<KeyRound size={17} />}
        title={t('speech.settings.key.title')}
        onClick={() => open({ kind: 'key', id: candidate.id })}
        trailing={keyTrailing(keyOf(candidate))}
      />
      {!candidate.custom && candidate.models.length > 1 ? (
        <SettingsRow
          icon={<SlidersHorizontal size={17} />}
          title={t('speech.settings.model')}
          onClick={() => open({ kind: 'model', id: candidate.id })}
          trailing={value(candidate.model)}
        />
      ) : null}
    </>
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
          secondary={enabledChain.join(' → ')}
          onClick={() => open({ kind: 'engines' })}
          trailing={chevron}
        />
        {engineRows(engine)}
        <SettingsRow
          icon={<ListChecks size={17} />}
          title={t('speech.settings.terms.title')}
          secondary={t('speech.settings.terms.count', {
            count: settings.terms.length,
          })}
          onClick={() => open({ kind: 'terms' })}
          trailing={chevron}
        />
        {(['alma', 'herdr'] as const).map((surface) => (
          <SettingsRow
            key={surface}
            icon={<Send size={17} />}
            title={t(`speech.settings.release.${surface}`)}
            onClick={() => open({ kind: 'release', surface })}
            trailing={value(releaseLabel(settings.release[surface]))}
          />
        ))}
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
        {test.row}
      </div>
      {test.output}
      {error ? <p className="settings-error">{error}</p> : null}
      {notice ? <p className="settings-section-note">{notice}</p> : null}

      {sheet?.kind === 'engines' ? (
        <EngineOrderSheet
          settings={settings}
          keys={keys}
          engineName={engineName}
          onChange={persist}
          onConfigure={(id) => open({ kind: 'engine', id })}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
      {sheet?.kind === 'engine' ? (
        <BottomSheet
          title={engineName(target)}
          onBack={() => setSheet({ kind: 'engines' })}
          onClose={() => setSheet(undefined)}
        >
          <div className="settings-group">{engineRows(target)}</div>
        </BottomSheet>
      ) : null}
      {sheet?.kind === 'release' ? (
        <BottomSheet
          title={t(`speech.settings.release.${sheet.surface}`)}
          onClose={() => setSheet(undefined)}
        >
          <p className="settings-section-note voice-sheet-note">
            {t('speech.settings.release.hint')}
          </p>
          <div className="sheet-list">
            {(['send', 'insert'] as const).map((action) => (
              <OptionRow
                key={action}
                label={releaseLabel(action)}
                selected={settings.release[sheet.surface] === action}
                onClick={() =>
                  pick({
                    ...settings,
                    release: { ...settings.release, [sheet.surface]: action },
                  })
                }
              />
            ))}
          </div>
        </BottomSheet>
      ) : null}
      {sheet?.kind === 'model' ? (
        <BottomSheet
          title={t('speech.settings.model')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {target.models.map((model) => (
              <OptionRow
                key={model}
                label={model}
                selected={model === target.model}
                onClick={() =>
                  pick({
                    ...settings,
                    models: { ...settings.models, [target.id]: model },
                  })
                }
              />
            ))}
          </div>
        </BottomSheet>
      ) : null}
      {sheet?.kind === 'key' ? (
        <KeySheet
          engine={target}
          engineName={engineName(target)}
          status={keyOf(target)}
          onClose={() => setSheet(undefined)}
          onStatus={(status) => setKeyStatus(target, status)}
        />
      ) : null}
      {sheet?.kind === 'custom' ? (
        <CustomEndpointSheet
          settings={settings}
          onClose={() => setSheet(undefined)}
          onSave={async (custom) => {
            const status = keyOf(target)
            const changed =
              custom.baseUrl !== settings.custom.baseUrl.trim() &&
              Boolean(settings.custom.baseUrl.trim())
            // A key is bound to the host it was saved for; a new host needs
            // the user to enter (and so re-bind) the key deliberately.
            if (changed && status?.set !== false) {
              try {
                await Speech.deleteKey({ engineId: 'custom' })
              } catch {
                return t('speech.settings.key.deleteFailed')
              }
              setKeyStatus(target, { set: false })
              setNotice(
                status?.set ? t('speech.settings.custom.keyCleared') : '',
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
      {sheet?.kind === 'terms' ? (
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

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange(checked: boolean): void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      className="settings-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

/**
 * The engine list: the first enabled engine is the primary, the enabled
 * ones after it are tried in order when it fails. Reorder by dragging the
 * handle, or with the arrow keys on it.
 */
function EngineOrderSheet({
  settings,
  keys,
  engineName,
  onChange,
  onConfigure,
  onClose,
}: {
  settings: SpeechSettings
  keys: Record<string, KeyStatus>
  engineName(engine: EngineConfig): string
  onChange(settings: SpeechSettings): void
  onConfigure(id: string): void
  onClose(): void
}) {
  const t = useT()
  const drag = useRef<{ id: string; lastY: number; rowHeight: number }>()
  const [dragging, setDragging] = useState<string>()
  const primary = primaryEngineId(settings)
  const enabledIds = settings.order.filter((id) => engineEnabled(settings, id))
  const move = (id: string, to: number) => {
    if (to < 0 || to >= settings.order.length) return
    void haptic('selection')
    onChange(moveEngine(settings, id, to))
  }
  return (
    <BottomSheet title={t('speech.settings.engines.title')} onClose={onClose}>
      <p className="settings-section-note voice-sheet-note">
        {t('speech.settings.engines.hint')}
      </p>
      <ol className="voice-engine-list">
        {settings.order.map((id, index) => {
          const engine = resolveEngine(settings, id)
          const name = engineName(engine)
          const enabled = engineEnabled(settings, id)
          const status = keys[keyIdOf(engine)]
          const role = !enabled
            ? t('speech.settings.engines.off')
            : id === primary
              ? t('speech.settings.engines.primary')
              : t('speech.settings.engines.fallback', {
                  position: enabledIds.indexOf(id),
                })
          const problem = !engineReady(engine)
            ? t('speech.settings.engines.notSetUp')
            : status && !status.set
              ? t('speech.settings.engines.noKey')
              : ''
          return (
            <li
              key={id}
              className="voice-engine-row"
              data-dragging={dragging === id}
              data-enabled={enabled}
            >
              <button
                type="button"
                className="voice-engine-handle"
                aria-label={t('speech.settings.engines.reorder', {
                  engine: name,
                })}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    move(id, index - 1)
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    move(id, index + 1)
                  }
                }}
                onPointerDown={(event) => {
                  const row = event.currentTarget.closest('li')
                  drag.current = {
                    id,
                    lastY: event.clientY,
                    rowHeight: row?.getBoundingClientRect().height || 56,
                  }
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  setDragging(id)
                }}
                onPointerMove={(event) => {
                  const current = drag.current
                  if (!current || current.id !== id) return
                  const rows = Math.trunc(
                    (event.clientY - current.lastY) / current.rowHeight,
                  )
                  if (!rows) return
                  const to = Math.max(
                    0,
                    Math.min(settings.order.length - 1, index + rows),
                  )
                  current.lastY += rows * current.rowHeight
                  if (to !== index) move(id, to)
                }}
                onPointerUp={() => {
                  drag.current = undefined
                  setDragging(undefined)
                }}
                onPointerCancel={() => {
                  drag.current = undefined
                  setDragging(undefined)
                }}
              >
                <GripVertical size={18} />
              </button>
              <button
                type="button"
                className="voice-engine-main"
                onClick={() => onConfigure(id)}
              >
                <span className="voice-engine-name">{name}</span>
                <small className="voice-engine-meta">
                  <span>{role}</span>
                  {engine.model ? <span>{engine.model}</span> : null}
                  {problem ? (
                    <span className="voice-engine-problem">{problem}</span>
                  ) : null}
                </small>
              </button>
              <Switch
                checked={enabled}
                // The last enabled engine stays on (setEngineEnabled).
                disabled={enabled && enabledIds.length === 1}
                label={t('speech.settings.engines.toggle', { engine: name })}
                onChange={(on) => {
                  void haptic('selection')
                  onChange(setEngineEnabled(settings, id, on))
                }}
              />
            </li>
          )
        })}
      </ol>
    </BottomSheet>
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
        engineId: keyIdOf(engine),
        key: typed,
        boundUrls: keyUrlsOf(engine),
      })
      setKey('')
      void haptic('light')
      onStatus(await Speech.keyStatus({ engineId: keyIdOf(engine) }))
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
      await Speech.deleteKey({ engineId: keyIdOf(engine) })
      void haptic('light')
      onStatus({ set: false })
      onClose()
    } catch {
      setError(t('speech.settings.key.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }
  const host = keyUrlsOf(engine).map(hostOf).filter(Boolean).join(', ')
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
