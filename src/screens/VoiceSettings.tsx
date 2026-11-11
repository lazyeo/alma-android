import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  GripVertical,
  ListChecks,
  Mic,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { SettingsRow } from '../components/SettingsRow'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  engineGroups,
  engineOn,
  KEY_PROVIDERS,
  keyBadge,
  moveListed,
  sharedKey,
} from '../speech/engineList'
import {
  engineReady,
  loadSpeechSettings,
  resolveEngine,
  saveSpeechSettings,
  setEngineEnabled,
  type DictationSurface,
  type ReleaseAction,
  type SpeechSettings,
} from '../speech/engineStore'
import { checkKey, type KeyCheck } from '../speech/keyCheck'
import {
  Speech,
  speechAvailable,
  type KeyStatus,
  type MicPermission,
} from '../speech/nativeSpeech'
import { keyIdOf, keyUrlsOf, PRESETS, validBaseUrl } from '../speech/presets'
import { DEFAULT_TERMS, formatTerms, parseTerms } from '../speech/terms'
import type { EngineConfig } from '../speech/types'
import { useVoiceTest, type VoiceTest } from '../speech/VoiceTest'

/** The one row opened in place, in the order card or the keys card. */
type Open = { card: 'engine' | 'key'; id: string }

const SURFACES: readonly DictationSurface[] = ['alma', 'herdr']
const RELEASE_ACTIONS: readonly ReleaseAction[] = ['send', 'insert']

/** Settings → Voice input. Hidden where there is no native recorder. */
export function VoiceSettings() {
  return speechAvailable() ? <VoiceSettingsSection /> : null
}

export function VoiceSettingsSection() {
  const t = useT()
  const [settings, setSettings] = useState(loadSpeechSettings)
  const [open, setOpen] = useState<Open>()
  const [moreOpen, setMoreOpen] = useState(false)
  /** Switched on without a key: it turns on once the key is saved. */
  const [pending, setPending] = useState<string>()
  const [termsOpen, setTermsOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** Per key id; missing while loading. */
  const [keys, setKeys] = useState<Record<string, KeyStatus>>({})
  /** The last check of each key id saved or re-checked on this page. */
  const [checks, setChecks] = useState<Record<string, KeyCheck>>({})
  const [mic, setMic] = useState<MicPermission>()
  const test = useVoiceTest()
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  useEffect(() => {
    let current = true
    for (const keyId of KEY_PROVIDERS)
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
  const engineName = (engine: EngineConfig) =>
    engine.custom ? t('speech.engine.custom') : engine.label
  /** The engine whose URLs a key id is bound to (the first that uses it). */
  const providerEngine = (keyId: string) =>
    resolveEngine(
      settings,
      PRESETS.find((preset) => keyIdOf(preset) === keyId)?.id,
    )
  /** The first engine's name: "Soniox" for the shared Soniox key. */
  const providerName = (keyId: string) => engineName(providerEngine(keyId))
  const toggleOpen = (next: Open) => {
    void haptic('selection')
    setNotice('')
    setOpen((current) =>
      current?.card === next.card && current.id === next.id ? undefined : next,
    )
  }

  const recheck = (keyId: string) => {
    setChecks((current) => ({ ...current, [keyId]: { state: 'checking' } }))
    void checkKey(Speech.request, providerEngine(keyId)).then((result) => {
      if (mounted.current)
        setChecks((current) => ({ ...current, [keyId]: result }))
    })
  }
  const keySaved = (keyId: string, status: KeyStatus) => {
    setKeys((current) => ({ ...current, [keyId]: status }))
    if (!status.set) {
      setChecks(({ [keyId]: _dropped, ...rest }) => rest)
      return
    }
    // The engine the user switched on without a key now has one.
    if (pending) {
      const engine = resolveEngine(settings, pending)
      if (keyIdOf(engine) === keyId && engineReady(engine)) {
        // Read back: the settings this closure saw may predate the save.
        persist(setEngineEnabled(loadSpeechSettings(), pending, true))
        setPending(undefined)
        setOpen(undefined)
      }
    }
    recheck(keyId)
  }
  const saveCustom = async (custom: SpeechSettings['custom']) => {
    const status = keys.custom
    const changed =
      custom.baseUrl !== settings.custom.baseUrl.trim() &&
      Boolean(settings.custom.baseUrl.trim())
    // A key is bound to the host it was saved for; a new host needs the
    // user to enter (and so re-bind) the key deliberately.
    if (changed && status?.set !== false) {
      try {
        await Speech.deleteKey({ engineId: 'custom' })
      } catch {
        return t('speech.settings.key.deleteFailed')
      }
      keySaved('custom', { set: false })
      setNotice(status?.set ? t('speech.settings.custom.keyCleared') : '')
    }
    const next = { ...settings, custom }
    // Switched on with its key already saved: the endpoint was all it lacked.
    const ready = pending === 'custom' && !changed && status?.set === true
    if (!persist(ready ? setEngineEnabled(next, 'custom', true) : next))
      return t('speech.settings.saveFailed')
    if (ready) {
      setPending(undefined)
      setOpen(undefined)
    }
    void haptic('light')
    return ''
  }

  const keyEditor = (keyId: string) => (
    <KeyEditor
      keyId={keyId}
      engine={providerEngine(keyId)}
      provider={providerName(keyId)}
      status={keys[keyId]}
      check={checks[keyId]}
      onStatus={(status) => keySaved(keyId, status)}
      onRecheck={() => recheck(keyId)}
    />
  )
  const customForm = (
    <CustomEndpointForm settings={settings} onSave={saveCustom} />
  )

  const { listed, more } = engineGroups(settings, keys)
  const onCount = settings.order.filter((id) =>
    engineOn(settings, id, keys),
  ).length
  const engineRow = (id: string, sortable: boolean) => {
    const engine = resolveEngine(settings, id)
    const keyId = keyIdOf(engine)
    const on = engineOn(settings, id, keys)
    const isOpen = open?.card === 'engine' && open.id === id
    const needsSetup =
      !engineReady(engine) || keys[keyId]?.set === false || pending === id
    return (
      <EngineRow
        key={id}
        name={engineName(engine)}
        badge={
          <KeyBadgeText
            engine={engine}
            status={keys[keyId]}
            check={checks[keyId]}
          />
        }
        on={on}
        // The last engine in use stays on.
        lockOn={on && onCount === 1}
        open={isOpen}
        drag={
          sortable
            ? {
                index: listed.indexOf(id),
                count: listed.length,
                move: (to) => {
                  void haptic('selection')
                  persist(moveListed(settings, listed, id, to))
                },
              }
            : undefined
        }
        onOpen={() => toggleOpen({ card: 'engine', id })}
        onSwitch={(next) => {
          void haptic('selection')
          if (!next) {
            if (pending === id) setPending(undefined)
            persist(setEngineEnabled(settings, id, false))
            return
          }
          if (engineReady(engine) && keys[keyId]?.set) {
            persist(setEngineEnabled(settings, id, true))
            return
          }
          // No key (or no endpoint) yet: ask for it right here, and turn
          // the engine on only once it is saved.
          setPending(id)
          setOpen({ card: 'engine', id })
        }}
      >
        {isOpen ? (
          needsSetup ? (
            <div className="voice-row-detail">
              <p className="settings-section-note">
                {engine.custom && !engineReady(engine)
                  ? t('speech.settings.order.needsEndpoint', {
                      engine: engineName(engine),
                    })
                  : t('speech.settings.order.needsKey', {
                      engine: engineName(engine),
                    })}
              </p>
              {engine.custom ? customForm : null}
              {engine.baseUrl ? keyEditor(keyId) : null}
            </div>
          ) : (
            <EngineDetail
              engine={engine}
              name={engineName(engine)}
              test={test}
              onModel={(model) => {
                void haptic('selection')
                persist({
                  ...settings,
                  models: { ...settings.models, [id]: model },
                })
              }}
            />
          )
        ) : null}
      </EngineRow>
    )
  }

  return (
    <section className="settings-section" aria-labelledby="voice-heading">
      <h2 id="voice-heading" className="settings-section-title">
        {t('speech.settings.title')}
      </h2>
      <p className="settings-section-note">{t('speech.settings.note')}</p>

      <h3 className="voice-card-title">{t('speech.settings.order.title')}</h3>
      <p className="settings-section-note">{t('speech.settings.order.hint')}</p>
      <div className="settings-group voice-card">
        <ol className="voice-engine-list">
          {listed.map((id) => engineRow(id, true))}
        </ol>
        {more.length ? (
          <>
            <button
              type="button"
              className="voice-more-toggle"
              aria-expanded={moreOpen}
              onClick={() => {
                void haptic('selection')
                setMoreOpen(!moreOpen)
              }}
            >
              <span>{t('speech.settings.order.more')}</span>
              <span className="settings-value">
                {t('speech.settings.order.moreCount', { count: more.length })}
              </span>
              <ChevronDown
                className="settings-chevron voice-more-chevron"
                size={16}
              />
            </button>
            {moreOpen ? (
              <ol className="voice-engine-list voice-engine-more">
                {more.map((id) => engineRow(id, false))}
              </ol>
            ) : null}
          </>
        ) : null}
      </div>

      <h3 className="voice-card-title">{t('speech.settings.keys.title')}</h3>
      <p className="settings-section-note">{t('speech.settings.keys.hint')}</p>
      <div className="settings-group voice-card">
        {KEY_PROVIDERS.map((keyId) => {
          const engine = providerEngine(keyId)
          const isOpen = open?.card === 'key' && open.id === keyId
          return (
            <div className="voice-provider" key={keyId} data-open={isOpen}>
              <button
                type="button"
                className="voice-provider-head"
                aria-expanded={isOpen}
                onClick={() => toggleOpen({ card: 'key', id: keyId })}
              >
                <span className="voice-row-copy">
                  <span className="voice-row-name">{providerName(keyId)}</span>
                  {sharedKey(keyId) ? (
                    <small>{t('speech.settings.keys.sharedBy')}</small>
                  ) : engine.custom ? (
                    <small>
                      {engine.baseUrl
                        ? hostOf(engine.baseUrl)
                        : t('speech.settings.custom.notSet')}
                    </small>
                  ) : null}
                </span>
                <ProviderStatus status={keys[keyId]} check={checks[keyId]} />
                <ChevronRight
                  className="settings-chevron voice-open-chevron"
                  size={16}
                />
              </button>
              {isOpen ? (
                <div className="voice-row-detail">
                  {engine.custom ? customForm : null}
                  {engine.baseUrl ? keyEditor(keyId) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <h3 className="voice-card-title">{t('speech.settings.release.title')}</h3>
      <p className="settings-section-note">
        {t('speech.settings.release.hint')}
      </p>
      <div className="settings-group voice-card">
        {SURFACES.map((surface) => (
          <div className="voice-release-row" key={surface}>
            <span className="voice-row-name" id={`voice-release-${surface}`}>
              {t(`speech.settings.release.${surface}`)}
            </span>
            <div
              className="voice-segments"
              role="group"
              aria-labelledby={`voice-release-${surface}`}
            >
              {RELEASE_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={settings.release[surface] === action}
                  onClick={() => {
                    if (settings.release[surface] === action) return
                    void haptic('selection')
                    persist({
                      ...settings,
                      release: { ...settings.release, [surface]: action },
                    })
                  }}
                >
                  {t(`speech.settings.release.${action}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="settings-group voice-card voice-card-last">
        <SettingsRow
          icon={<ListChecks size={17} />}
          title={t('speech.settings.terms.title')}
          secondary={t('speech.settings.terms.count', {
            count: settings.terms.length,
          })}
          onClick={() => {
            void haptic('selection')
            setTermsOpen(true)
          }}
          trailing={<ChevronRight className="settings-chevron" size={16} />}
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
            trailing={<ChevronRight className="settings-chevron" size={16} />}
          />
        ) : null}
        {test.row}
      </div>
      {test.target === undefined ? test.output : null}
      {error ? <p className="settings-error">{error}</p> : null}
      {notice ? <p className="settings-section-note">{notice}</p> : null}

      {termsOpen ? (
        <TermsSheet
          terms={settings.terms}
          onClose={() => setTermsOpen(false)}
          onSave={(terms) => {
            if (!persist({ ...settings, terms }))
              return t('speech.settings.saveFailed')
            void haptic('light')
            setTermsOpen(false)
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
 * One engine in the order card: handle, name and key state, switch; its
 * detail opens below it. Reorder by dragging the handle, or with the arrow
 * keys on it.
 */
function EngineRow({
  name,
  badge,
  on,
  lockOn,
  open,
  drag,
  onOpen,
  onSwitch,
  children,
}: {
  name: string
  badge: ReactNode
  on: boolean
  lockOn: boolean
  open: boolean
  /** Absent for folded engines, which are not in the order yet. */
  drag?: { index: number; count: number; move(to: number): void }
  onOpen(): void
  onSwitch(on: boolean): void
  children: ReactNode
}) {
  const t = useT()
  const grab = useRef<{ lastY: number; rowHeight: number }>()
  const [dragging, setDragging] = useState(false)
  const stop = () => {
    grab.current = undefined
    setDragging(false)
  }
  return (
    <li
      className="voice-engine-row"
      data-dragging={dragging}
      data-on={on}
      data-open={open}
    >
      <div className="voice-engine-line">
        {drag ? (
          <button
            type="button"
            className="voice-engine-handle"
            aria-label={t('speech.settings.order.reorder', { engine: name })}
            onKeyDown={(event) => {
              const step =
                event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
              if (!step) return
              event.preventDefault()
              const to = drag.index + step
              if (to >= 0 && to < drag.count) drag.move(to)
            }}
            onPointerDown={(event) => {
              const row = event.currentTarget.closest('li')
              grab.current = {
                lastY: event.clientY,
                rowHeight: row?.getBoundingClientRect().height || 56,
              }
              event.currentTarget.setPointerCapture?.(event.pointerId)
              setDragging(true)
            }}
            onPointerMove={(event) => {
              const current = grab.current
              if (!current) return
              const rows = Math.trunc(
                (event.clientY - current.lastY) / current.rowHeight,
              )
              if (!rows) return
              const to = Math.max(
                0,
                Math.min(drag.count - 1, drag.index + rows),
              )
              current.lastY += rows * current.rowHeight
              if (to !== drag.index) drag.move(to)
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
          >
            <GripVertical size={18} />
          </button>
        ) : (
          <span className="voice-engine-handle" aria-hidden="true" />
        )}
        <button
          type="button"
          className="voice-engine-main"
          aria-expanded={open}
          onClick={onOpen}
        >
          <span className="voice-row-name">{name}</span>
          {badge}
        </button>
        <Switch
          checked={on}
          disabled={lockOn}
          label={t('speech.settings.order.toggle', { engine: name })}
          onChange={onSwitch}
        />
      </div>
      {children}
    </li>
  )
}

/** "✓ ••••abcd", "✓ Shared Soniox key ••••abcd", "No key", "Key rejected". */
function KeyBadgeText({
  engine,
  status,
  check,
}: {
  engine: EngineConfig
  status?: KeyStatus
  check?: KeyCheck
}) {
  const t = useT()
  if (engine.custom && !engineReady(engine))
    return (
      <small className="voice-key-badge" data-tone="missing">
        {t('speech.settings.order.notSetUp')}
      </small>
    )
  const badge = keyBadge(keyIdOf(engine), status)
  if (badge.kind === 'loading')
    return <small className="voice-key-badge" data-tone="loading" />
  if (badge.kind === 'missing')
    return (
      <small className="voice-key-badge" data-tone="missing">
        {t('speech.settings.order.keyMissing')}
      </small>
    )
  if (check?.state === 'failed' && check.reason === 'auth')
    return (
      <small className="voice-key-badge" data-tone="error">
        <TriangleAlert size={12} aria-hidden="true" />
        {t('speech.settings.key.check.auth')}
      </small>
    )
  return (
    <small className="voice-key-badge" data-tone="set">
      <Check size={12} aria-hidden="true" />
      {badge.shared ? (
        <span>{t('speech.settings.order.keyShared')}</span>
      ) : null}
      {badge.last4 ? (
        <span className="voice-key-last4">
          {'••••'}
          {badge.last4}
        </span>
      ) : null}
    </small>
  )
}

/** The keys card's trailing state: the check if one ran, else the key. */
function ProviderStatus({
  status,
  check,
}: {
  status?: KeyStatus
  check?: KeyCheck
}) {
  const t = useT()
  if (!status) return null
  if (!status.set)
    return (
      <span className="voice-provider-status" data-tone="missing">
        {t('speech.settings.key.notSet')}
      </span>
    )
  if (check && check.state !== 'ok') return <CheckText check={check} compact />
  return (
    <span className="voice-provider-status" data-tone="set">
      <Check size={12} aria-hidden="true" />
      {status.last4 ? (
        <span className="voice-key-last4">
          {'••••'}
          {status.last4}
        </span>
      ) : null}
    </span>
  )
}

function CheckText({
  check,
  compact,
}: {
  check: KeyCheck
  /** Leaves out the HTTP detail, for the row's trailing slot. */
  compact?: boolean
}) {
  const t = useT()
  const tone =
    check.state === 'ok'
      ? 'set'
      : check.state === 'checking'
        ? 'loading'
        : check.reason === 'unverified' || check.reason === 'network'
          ? 'warn'
          : 'error'
  const text =
    check.state === 'failed'
      ? t(`speech.settings.key.check.${check.reason}`)
      : t(`speech.settings.key.check.${check.state}`)
  return (
    <span
      className="voice-provider-status voice-key-check"
      data-tone={tone}
      role={compact ? undefined : 'status'}
    >
      {tone === 'set' ? <Check size={12} aria-hidden="true" /> : null}
      {tone === 'error' || tone === 'warn' ? (
        <TriangleAlert size={12} aria-hidden="true" />
      ) : null}
      <span>{text}</span>
      {!compact && check.state === 'failed' && check.detail ? (
        <small>{check.detail}</small>
      ) : null}
    </span>
  )
}

/**
 * Entering, pasting or deleting one provider's key. A typed key lives only
 * in this form's state and goes straight to the native key store; a pasted
 * one never enters JS at all (Speech.pasteKey).
 */
function KeyEditor({
  keyId,
  engine,
  provider,
  status,
  check,
  onStatus,
  onRecheck,
}: {
  keyId: string
  /** Supplies the URLs the key is bound to. */
  engine: EngineConfig
  provider: string
  status?: KeyStatus
  check?: KeyCheck
  onStatus(status: KeyStatus): void
  onRecheck(): void
}) {
  const t = useT()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Clear the draft however the form goes away.
  useEffect(() => () => setKey(''), [])
  const boundUrls = keyUrlsOf(engine)
  const run = async (action: () => Promise<KeyStatus>, failed: string) => {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setKey('')
      void haptic('light')
      onStatus(next)
    } catch (caught) {
      const code =
        caught && typeof caught === 'object' && 'code' in caught
          ? String((caught as { code: unknown }).code)
          : ''
      setError(
        code === 'clipboard_empty'
          ? t('speech.settings.key.pasteEmpty')
          : failed,
      )
    } finally {
      setBusy(false)
    }
  }
  const save = () => {
    const typed = key.trim()
    if (!typed) return
    void run(async () => {
      await Speech.setKey({ engineId: keyId, key: typed, boundUrls })
      return Speech.keyStatus({ engineId: keyId })
    }, t('speech.settings.key.saveFailed'))
  }
  const paste = () =>
    void run(
      () => Speech.pasteKey({ engineId: keyId, boundUrls }),
      t('speech.settings.key.saveFailed'),
    )
  const remove = () =>
    void run(async () => {
      await Speech.deleteKey({ engineId: keyId })
      return { set: false }
    }, t('speech.settings.key.deleteFailed'))
  const host = boundUrls.map(hostOf).filter(Boolean).join(', ')
  const label = t('speech.settings.key.label', { provider })
  return (
    <form
      className="voice-key-editor"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="voice-key-input">
        <input
          className="rename-input"
          type="password"
          name="speech-api-key"
          aria-label={label}
          placeholder={
            status?.set
              ? t('speech.settings.key.replacePlaceholder')
              : t('speech.settings.key.placeholder')
          }
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          type="submit"
          className="primary voice-key-save"
          disabled={busy || !key.trim()}
        >
          {t('speech.settings.key.save')}
        </button>
      </div>
      <div className="voice-key-actions">
        <button
          type="button"
          className="quiet-text-button"
          disabled={busy}
          onClick={paste}
        >
          <ClipboardPaste size={14} aria-hidden="true" />
          {t('speech.settings.key.paste')}
        </button>
        {status?.set && check?.state !== 'checking' ? (
          <button
            type="button"
            className="quiet-text-button"
            disabled={busy}
            onClick={onRecheck}
          >
            {t('speech.settings.key.recheck')}
          </button>
        ) : null}
        {status?.set ? (
          <button
            type="button"
            className="quiet-text-button danger-text"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t('speech.settings.key.delete')}
          </button>
        ) : null}
      </div>
      {check ? <CheckText check={check} /> : null}
      {error ? <p className="settings-error">{error}</p> : null}
      {host ? (
        <p className="settings-section-note">
          {t('speech.settings.key.hint', { host })}
        </p>
      ) : null}
    </form>
  )
}

/** An engine row's detail once it can run: its model and a test. */
function EngineDetail({
  engine,
  name,
  test,
  onModel,
}: {
  engine: EngineConfig
  name: string
  test: VoiceTest
  onModel(model: string): void
}) {
  const t = useT()
  const mine = test.target === engine.id
  return (
    <div className="voice-row-detail">
      {!engine.custom && engine.models.length > 1 ? (
        <div
          className="voice-model-choice"
          role="group"
          aria-label={t('speech.settings.model')}
        >
          {engine.models.map((model) => (
            <button
              key={model}
              type="button"
              className="chip-button"
              aria-pressed={model === engine.model}
              onClick={() => onModel(model)}
            >
              {model}
            </button>
          ))}
        </div>
      ) : (
        <p className="settings-section-note">
          {t('speech.settings.model')}: {engine.model}
        </p>
      )}
      <div className="voice-key-actions">
        <button
          type="button"
          className="quiet-text-button"
          disabled={test.busy && !mine}
          onClick={() => test.run(engine.id)}
        >
          {t('speech.settings.order.test', { engine: name })}
        </button>
        {mine && test.busy ? (
          <span className="settings-value">{test.status}</span>
        ) : null}
      </div>
      {mine ? test.output : null}
    </div>
  )
}

function CustomEndpointForm({
  settings,
  onSave,
}: {
  settings: SpeechSettings
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
  const unchanged =
    trimmedUrl === settings.custom.baseUrl.trim() &&
    model.trim() === settings.custom.model.trim()
  const save = async () => {
    if (!urlValid || !model.trim()) return
    setBusy(true)
    const message = await onSave({ baseUrl: trimmedUrl, model: model.trim() })
    setBusy(false)
    setError(message)
  }
  return (
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
      {unchanged ? null : (
        <button
          type="submit"
          className="quiet-text-button"
          disabled={busy || !urlValid || !model.trim()}
        >
          {t('speech.settings.custom.save')}
        </button>
      )}
      {error ? <p className="settings-error">{error}</p> : null}
    </form>
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
