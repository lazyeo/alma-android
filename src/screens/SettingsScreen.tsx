import { buildInfo } from '../buildInfo'
import { ExtensionSettings } from '../extensions'
import { useEffect, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { SettingsRow } from '../components/SettingsRow'
import { presenceClass, usePresence } from '../components/usePresence'
import { haptic, hapticsEnabled } from '../haptics'
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  DraftingCompass,
  FoldHorizontal,
  Gauge,
  Info,
  Eye,
  EyeOff,
  Laptop,
  MessageCircleQuestion,
  Play,
  Plus,
  ScrollText,
  ShieldCheck,
  Trash2,
  Vibrate,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import {
  defaultFoldTransitionSettings,
  foldTransitionNativeConfig,
  loadFoldTransitionSettings,
  saveFoldTransitionSettings,
  type FoldTransitionSettings,
} from '../foldTransition'
import {
  configureNativeFoldTransition,
  getNativeFoldAngleSource,
  previewNativeFoldTransition,
  requestNativeShizukuPermission,
  type FoldAngleSourceState,
} from '../nativeBridge'
import { ThemeSettingsView } from '../ThemeProvider'
import { LanguageSettings } from './LanguageSettings'
import { useNavigate } from 'react-router-dom'
import { useDesktops } from '../desktops/DesktopContext'
import { useHandoff } from '../handoff/HandoffProvider'
import { desktopRowSecondary, humanConnectionError } from '../uiCopy'
import {
  canHideDesktop,
  hiddenPairings,
  visiblePairings,
} from '../desktops/desktopVisibility'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n'
import type { DesktopStatus } from '../relay'

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange(checked: boolean): void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="settings-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

const foldStrengthOptions = [
  { value: 0.4, label: 'settings.fold.strength.light' },
  { value: 0.7, label: 'settings.fold.strength.standard' },
  { value: 1, label: 'settings.fold.strength.strong' },
] as const satisfies readonly { value: number; label: MessageKey }[]
const statusLabels: Record<DesktopStatus, MessageKey> = {
  online: 'connection.status.online',
  connecting: 'connection.status.connecting',
  offline: 'connection.status.offline',
  error: 'connection.status.error',
}
const foldBlurOptions = [0.08, 0.12, 0.18] as const
const foldDarkeningOptions = [0.008, 0.015, 0.025] as const
const foldEyeDistanceOptions = [300, 450, 650] as const

const foldStrengthLabel = (strength: number, t: ReturnType<typeof useT>) => {
  const label = foldStrengthOptions.find(
    ({ value }) => value === strength,
  )?.label
  return label ? t(label) : `${Math.round(strength * 100)}%`
}

function FoldTransitionSection() {
  const t = useT()
  const [settings, setSettings] = useState(loadFoldTransitionSettings)
  const [sheet, setSheet] = useState<
    'strength' | 'side' | 'blur' | 'darkening' | 'eyeDistance'
  >()
  const [error, setError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedPresence = usePresence(advancedOpen)
  const [angleSource, setAngleSource] = useState<FoldAngleSourceState>()
  useEffect(() => {
    let current = true
    const refresh = () =>
      getNativeFoldAngleSource()
        .then((state) => {
          if (current) setAngleSource(state)
        })
        .catch(() => undefined)
    void refresh()
    const interval = window.setInterval(refresh, 1_000)
    return () => {
      current = false
      window.clearInterval(interval)
    }
  }, [])
  const update = (next: FoldTransitionSettings) => {
    try {
      saveFoldTransitionSettings(next)
    } catch {
      setError(t('settings.fold.saveFailed'))
      return
    }
    setSettings(next)
    setError('')
    configureNativeFoldTransition(foldTransitionNativeConfig(next)).catch(() =>
      setError(t('settings.fold.applyFailed')),
    )
  }
  const choose = (next: FoldTransitionSettings) => {
    void haptic('selection')
    setSheet(undefined)
    update(next)
  }
  return (
    <section className="settings-section" aria-labelledby="fold-heading">
      <h2 id="fold-heading" className="settings-section-title">
        {t('settings.fold.title')}
      </h2>
      <p className="settings-section-note">{t('settings.fold.note')}</p>
      <div className="settings-group">
        <SettingsRow
          icon={<FoldHorizontal size={17} />}
          title={t('settings.fold.title')}
          trailing={
            <Switch
              label={t('settings.fold.title')}
              checked={settings.enabled}
              onChange={(enabled) => {
                void haptic('selection')
                update({ ...settings, enabled })
              }}
            />
          }
        />
        <SettingsRow
          icon={<Gauge size={17} />}
          title={t('settings.fold.hinge.title')}
          secondary={
            angleSource?.source === 'shizuku'
              ? t('settings.fold.hinge.live')
              : angleSource?.shizukuRunning
                ? t('settings.fold.hinge.waiting')
                : t('settings.fold.hinge.notRunning')
          }
          trailing={
            <span className="settings-value">
              {angleSource?.source === 'shizuku'
                ? t('settings.fold.hinge.shizuku')
                : t('settings.fold.hinge.estimated')}
            </span>
          }
        />
        {angleSource?.shizukuRunning && angleSource.permission !== 'granted' ? (
          <SettingsRow
            icon={<ShieldCheck size={17} />}
            title={t('settings.fold.grant.title')}
            secondary={
              angleSource.permission === 'denied'
                ? t('settings.fold.grant.denied')
                : t('settings.fold.grant.hint')
            }
            onClick={() => {
              void haptic('light')
              requestNativeShizukuPermission()
                .then((state) => state && setAngleSource(state))
                .catch(() => setError(t('settings.fold.grant.failed')))
            }}
            trailing={<ChevronRight className="settings-chevron" size={16} />}
          />
        ) : null}
        <SettingsRow
          icon={<Gauge size={17} />}
          title={t('settings.fold.strength.title')}
          onClick={() => {
            void haptic('selection')
            setSheet('strength')
          }}
          trailing={
            <span className="desktop-row-trailing">
              <span className="settings-value">
                {foldStrengthLabel(settings.strength, t)}
              </span>
              <ChevronRight className="settings-chevron" size={16} />
            </span>
          }
        />
        <SettingsRow
          icon={<FoldHorizontal size={17} />}
          title={t('settings.fold.side.title')}
          onClick={() => {
            void haptic('selection')
            setSheet('side')
          }}
          trailing={
            <span className="desktop-row-trailing">
              <span className="settings-value">
                {settings.movingSide === 'left'
                  ? t('settings.fold.side.left')
                  : t('settings.fold.side.right')}
              </span>
              <ChevronRight className="settings-chevron" size={16} />
            </span>
          }
        />
        <SettingsRow
          icon={<SlidersHorizontal size={17} />}
          title={t('settings.fold.advanced.title')}
          secondary={t('settings.fold.advanced.hint')}
          ariaLabel={
            advancedOpen
              ? t('settings.fold.advanced.collapse')
              : t('settings.fold.advanced.expand')
          }
          onClick={() => {
            void haptic('selection')
            setAdvancedOpen((open) => !open)
          }}
          trailing={
            <ChevronDown
              className={`settings-chevron fold-advanced-chevron${advancedOpen ? ' open' : ''}`}
              size={16}
            />
          }
        />
        {advancedPresence.rendered ? (
          <div
            className={`${presenceClass(advancedPresence.phase)} fold-advanced-list`}
          >
            <SettingsRow
              icon={<Gauge size={17} />}
              title={t('settings.fold.blur.title')}
              onClick={() => {
                void haptic('selection')
                setSheet('blur')
              }}
              trailing={
                <span className="desktop-row-trailing">
                  <span className="settings-value">
                    {settings.blurSpread.toFixed(2)}
                  </span>
                  <ChevronRight className="settings-chevron" size={16} />
                </span>
              }
            />
            <SettingsRow
              icon={<Gauge size={17} />}
              title={t('settings.fold.darkening.title')}
              onClick={() => {
                void haptic('selection')
                setSheet('darkening')
              }}
              trailing={
                <span className="desktop-row-trailing">
                  <span className="settings-value">
                    {settings.darkening.toFixed(3)}
                  </span>
                  <ChevronRight className="settings-chevron" size={16} />
                </span>
              }
            />
            <SettingsRow
              icon={<DraftingCompass size={17} />}
              title={t('settings.fold.eyeDistance.title')}
              onClick={() => {
                void haptic('selection')
                setSheet('eyeDistance')
              }}
              trailing={
                <span className="desktop-row-trailing">
                  <span className="settings-value">{`${settings.eyeDistanceMm} mm`}</span>
                  <ChevronRight className="settings-chevron" size={16} />
                </span>
              }
            />
            <SettingsRow
              icon={<ScrollText size={17} />}
              title={t('settings.fold.logging.title')}
              secondary={t('settings.fold.logging.hint')}
              trailing={
                <Switch
                  label={t('settings.fold.logging.title')}
                  checked={settings.logging}
                  onChange={(logging) => {
                    void haptic('selection')
                    update({ ...settings, logging })
                  }}
                />
              }
            />
            {(['open', 'close'] as const).map((direction) => (
              <SettingsRow
                key={direction}
                icon={<Play size={17} />}
                title={t(`settings.fold.preview.${direction}`)}
                secondary={t('settings.fold.preview.hint')}
                onClick={() => {
                  void haptic('light')
                  previewNativeFoldTransition(direction)
                    .then((played) =>
                      setError(
                        played ? '' : t('settings.fold.preview.unsupported'),
                      ),
                    )
                    .catch(() => setError(t('settings.fold.preview.failed')))
                }}
              />
            ))}
            <SettingsRow
              icon={<RotateCcw size={17} />}
              title={t('settings.fold.reset.title')}
              secondary={t('settings.fold.reset.hint')}
              onClick={() => {
                void haptic('light')
                update({
                  ...settings,
                  activationAngle:
                    defaultFoldTransitionSettings.activationAngle,
                  blurSpread: defaultFoldTransitionSettings.blurSpread,
                  darkening: defaultFoldTransitionSettings.darkening,
                  eyeDistanceMm: defaultFoldTransitionSettings.eyeDistanceMm,
                  logging: defaultFoldTransitionSettings.logging,
                })
              }}
            />
          </div>
        ) : null}
      </div>
      {error ? <p className="settings-error">{error}</p> : null}
      {sheet === 'strength' ? (
        <BottomSheet
          title={t('settings.fold.strength.title')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {foldStrengthOptions.map(({ value, label }) => {
              const selected = settings.strength === value
              return (
                <button
                  key={value}
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => choose({ ...settings, strength: value })}
                >
                  <span className="sheet-row-copy">
                    <span>{t(label)}</span>
                    {value === defaultFoldTransitionSettings.strength ? (
                      <small>{t('settings.fold.default')}</small>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check className="sheet-row-check" size={18} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'blur' ? (
        <BottomSheet
          title={t('settings.fold.blur.title')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {foldBlurOptions.map((value) => {
              const selected = settings.blurSpread === value
              return (
                <button
                  key={value}
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => choose({ ...settings, blurSpread: value })}
                >
                  <span className="sheet-row-copy">
                    <span>{value.toFixed(2)}</span>
                    <small>{t('settings.fold.blur.hint')}</small>
                  </span>
                  {selected ? (
                    <Check className="sheet-row-check" size={18} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'darkening' ? (
        <BottomSheet
          title={t('settings.fold.darkening.title')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {foldDarkeningOptions.map((value) => {
              const selected = settings.darkening === value
              return (
                <button
                  key={value}
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => choose({ ...settings, darkening: value })}
                >
                  <span className="sheet-row-copy">
                    <span>{value.toFixed(3)}</span>
                    <small>{t('settings.fold.darkening.hint')}</small>
                  </span>
                  {selected ? (
                    <Check className="sheet-row-check" size={18} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'eyeDistance' ? (
        <BottomSheet
          title={t('settings.fold.eyeDistance.title')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {foldEyeDistanceOptions.map((value) => {
              const selected = settings.eyeDistanceMm === value
              return (
                <button
                  key={value}
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => choose({ ...settings, eyeDistanceMm: value })}
                >
                  <span className="sheet-row-copy">
                    <span>{`${value} mm`}</span>
                    <small>{t('settings.fold.eyeDistance.hint')}</small>
                  </span>
                  {selected ? (
                    <Check className="sheet-row-check" size={18} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'side' ? (
        <BottomSheet
          title={t('settings.fold.side.title')}
          onClose={() => setSheet(undefined)}
        >
          <div className="sheet-list">
            {(['left', 'right'] as const).map((side) => {
              const selected = settings.movingSide === side
              return (
                <button
                  key={side}
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => choose({ ...settings, movingSide: side })}
                >
                  <span className="sheet-row-copy">
                    <span>
                      {side === 'left'
                        ? t('settings.fold.side.left')
                        : t('settings.fold.side.right')}
                    </span>
                    <small>{t('settings.fold.side.hint')}</small>
                  </span>
                  {selected ? (
                    <Check className="sheet-row-check" size={18} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  )
}

export function SettingsScreen() {
  const t = useT()
  const navigate = useNavigate()
  const [desktopDetail, setDesktopDetail] = useState<string>()
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const hiddenPresence = usePresence(hiddenOpen)
  const [editing, setEditing] = useState<{ id: string; name: string }>()
  const [removing, setRemoving] = useState<{ id: string; name: string }>()
  const [feedback, setFeedback] = useState(hapticsEnabled)
  const [feedbackError, setFeedbackError] = useState('')
  const { store, desktops, rename, setHidden, remove } = useDesktops()
  const {
    notificationSettings,
    permission,
    updateNotificationSettings,
    requestNotificationPermission,
  } = useHandoff()
  const activeId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const visibleDesktops = desktops.filter(
    ({ pairing }) => pairing.hidden !== true,
  )
  const hiddenIds = new Set(hiddenPairings(store.pairings).map(({ id }) => id))
  const hiddenDesktops = desktops.filter(({ pairing }) =>
    hiddenIds.has(pairing.id),
  )
  const selectedDesktop = desktops.find(
    ({ pairing }) => pairing.id === desktopDetail,
  )
  return (
    <section className="root-page settings-page">
      <header className="page-header">
        <h1>{t('settings.title')}</h1>
      </header>
      <div className="page-body settings-page-body">
        <div className="settings-grid">
          <ThemeSettingsView />
          <LanguageSettings />
          <ExtensionSettings />
          <section
            className="settings-section"
            aria-labelledby="interaction-heading"
          >
            <h2 id="interaction-heading" className="settings-section-title">
              {t('settings.interaction.title')}
            </h2>
            <div className="settings-group">
              <SettingsRow
                icon={<Vibrate size={17} />}
                title={t('settings.interaction.haptics')}
                trailing={
                  <Switch
                    label={t('settings.interaction.haptics')}
                    checked={feedback}
                    onChange={(enabled) => {
                      try {
                        localStorage.setItem(
                          'alma-haptics',
                          enabled ? 'on' : 'off',
                        )
                        setFeedback(enabled)
                        setFeedbackError('')
                        if (enabled) void haptic('selection')
                      } catch {
                        setFeedbackError(t('settings.saveFailed'))
                      }
                    }}
                  />
                }
              />
            </div>
            {feedbackError ? (
              <p className="settings-error">{feedbackError}</p>
            ) : null}
          </section>

          <FoldTransitionSection />

          <section
            className="settings-section"
            aria-labelledby="desktops-heading"
          >
            <h2 id="desktops-heading" className="settings-section-title">
              {t('settings.desktops.title')}
            </h2>
            <div className="settings-group desktop-list">
              {visibleDesktops.map(({ pairing, status, connection }) => (
                <SettingsRow
                  key={pairing.id}
                  icon={<Laptop size={17} />}
                  title={pairing.name}
                  secondary={desktopRowSecondary(
                    status,
                    pairing.id === store.activeId,
                    connection?.error,
                  )}
                  ariaLabel={t('connection.switcher.item', {
                    name: pairing.name,
                    status: t(statusLabels[status]),
                  })}
                  onClick={() => {
                    void haptic('selection')
                    setDesktopDetail(pairing.id)
                  }}
                  trailing={
                    <span className="desktop-row-trailing">
                      <span className={`status-dot ${status}`} />
                      <ChevronRight className="settings-chevron" size={16} />
                    </span>
                  }
                />
              ))}
              <SettingsRow
                icon={<Plus size={17} />}
                title={t('connection.switcher.add')}
                onClick={() => {
                  void haptic('light')
                  navigate('/pair')
                }}
                trailing={
                  <ChevronRight className="settings-chevron" size={16} />
                }
              />
              {hiddenDesktops.length ? (
                <SettingsRow
                  icon={<EyeOff size={17} />}
                  title={t('settings.desktops.hiddenCount', {
                    count: hiddenDesktops.length,
                  })}
                  ariaLabel={
                    hiddenOpen
                      ? t('settings.desktops.collapseHidden')
                      : t('settings.desktops.expandHidden')
                  }
                  onClick={() => {
                    void haptic('selection')
                    setHiddenOpen((open) => !open)
                  }}
                  trailing={
                    <ChevronDown
                      className={`settings-chevron hidden-desktops-chevron${hiddenOpen ? ' open' : ''}`}
                      size={16}
                    />
                  }
                />
              ) : null}
              {hiddenPresence.rendered ? (
                <div
                  className={`${presenceClass(hiddenPresence.phase)} hidden-desktops-list`}
                >
                  {hiddenDesktops.map(({ pairing }) => (
                    <SettingsRow
                      key={pairing.id}
                      icon={<Laptop size={17} />}
                      title={pairing.name}
                      secondary={t('settings.desktops.hiddenHint')}
                      onClick={() => {
                        void haptic('selection')
                        setDesktopDetail(pairing.id)
                      }}
                      trailing={
                        <ChevronRight className="settings-chevron" size={16} />
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section
            className="settings-section"
            aria-labelledby="notifications-heading"
          >
            <h2 id="notifications-heading" className="settings-section-title">
              {t('settings.notifications.title')}
            </h2>
            <p className="settings-section-note">
              {t('settings.notifications.note')}
            </p>
            <div className="settings-group">
              {permission !== 'granted' ? (
                <SettingsRow
                  icon={<BellRing size={17} />}
                  title={
                    permission === 'denied'
                      ? t('settings.notifications.blocked')
                      : permission === 'unsupported'
                        ? t('settings.notifications.unavailable')
                        : t('settings.notifications.enable')
                  }
                  secondary={
                    permission === 'denied'
                      ? t('settings.notifications.blockedHint')
                      : t('settings.notifications.enableHint')
                  }
                  onClick={
                    permission === 'default'
                      ? () => void requestNotificationPermission()
                      : undefined
                  }
                  trailing={
                    permission === 'default' ? (
                      <ChevronRight className="settings-chevron" size={16} />
                    ) : undefined
                  }
                />
              ) : (
                <SettingsRow
                  icon={<ShieldCheck size={17} />}
                  title={t('settings.notifications.granted')}
                  secondary={t('settings.notifications.grantedHint')}
                />
              )}
              {(
                [
                  ['approvals', Bell],
                  ['questions', MessageCircleQuestion],
                  ['generationComplete', CircleHelp],
                  ['agentNeedsYou', BellRing],
                ] as const
              ).map(([key, Icon]) => (
                <SettingsRow
                  key={key}
                  icon={<Icon size={17} />}
                  title={t(`settings.notifications.${key}`)}
                  trailing={
                    <Switch
                      label={t(`settings.notifications.${key}`)}
                      checked={notificationSettings[key]}
                      onChange={(checked) => {
                        void haptic('selection')
                        updateNotificationSettings({
                          ...notificationSettings,
                          [key]: checked,
                        })
                      }}
                    />
                  }
                />
              ))}
            </div>
          </section>

          <section className="settings-section" aria-labelledby="about-heading">
            <h2 id="about-heading" className="settings-section-title">
              {t('settings.about.title')}
            </h2>
            <div className="settings-group">
              <SettingsRow
                icon={<Info size={17} />}
                title={t('settings.about.version')}
                trailing={<span className="settings-value">{buildInfo}</span>}
              />
              <SettingsRow
                icon={<ShieldCheck size={17} />}
                title={t('settings.about.protocol')}
                trailing={
                  <span className="settings-value">alma-relay-e2e/v1</span>
                }
              />
            </div>
          </section>
        </div>
      </div>

      {selectedDesktop ? (
        <BottomSheet
          title={selectedDesktop.pairing.name}
          onClose={() => setDesktopDetail(undefined)}
        >
          <div className="desktop-detail-summary">
            <span className={`status-dot ${selectedDesktop.status}`} />
            <span>
              <strong>{t(statusLabels[selectedDesktop.status])}</strong>
              <small>
                {selectedDesktop.pairing.id === store.activeId
                  ? t('connection.currentDesktop')
                  : selectedDesktop.status === 'online'
                    ? t('connection.status.online')
                    : humanConnectionError(selectedDesktop.connection?.error)}
              </small>
            </span>
          </div>
          {selectedDesktop.connection?.error ? (
            <p className="desktop-detail-error">
              <strong>
                {humanConnectionError(selectedDesktop.connection.error)}
              </strong>
              <small>{selectedDesktop.connection.error}</small>
            </p>
          ) : null}
          <div className="sheet-list desktop-detail-actions">
            <button
              className="sheet-row"
              onClick={() => {
                setEditing({
                  id: selectedDesktop.pairing.id,
                  name: selectedDesktop.pairing.name,
                })
                setDesktopDetail(undefined)
              }}
            >
              <Laptop size={18} />
              <span className="sheet-row-copy">
                <span>{t('settings.desktops.rename')}</span>
                <small>{t('settings.desktops.renameHint')}</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              className="sheet-row"
              disabled={
                selectedDesktop.pairing.hidden !== true &&
                !canHideDesktop(store.pairings, selectedDesktop.pairing.id)
              }
              onClick={() => {
                void haptic('selection')
                setHidden(
                  selectedDesktop.pairing.id,
                  selectedDesktop.pairing.hidden !== true,
                )
                setDesktopDetail(undefined)
              }}
            >
              {selectedDesktop.pairing.hidden ? (
                <Eye size={18} />
              ) : (
                <EyeOff size={18} />
              )}
              <span className="sheet-row-copy">
                <span>
                  {selectedDesktop.pairing.hidden
                    ? t('settings.desktops.show')
                    : t('settings.desktops.hide')}
                </span>
                <small>
                  {selectedDesktop.pairing.hidden
                    ? t('settings.desktops.showHint')
                    : canHideDesktop(store.pairings, selectedDesktop.pairing.id)
                      ? t('settings.desktops.hideHint')
                      : t('settings.desktops.lastVisible')}
                </small>
              </span>
            </button>
            <button
              className="sheet-row danger"
              onClick={() => {
                setRemoving({
                  id: selectedDesktop.pairing.id,
                  name: selectedDesktop.pairing.name,
                })
                setDesktopDetail(undefined)
              }}
            >
              <Trash2 size={18} />
              <span className="sheet-row-copy">
                <span>{t('settings.desktops.remove')}</span>
                <small>{t('settings.desktops.removeHint')}</small>
              </span>
            </button>
          </div>
        </BottomSheet>
      ) : null}
      {editing ? (
        <BottomSheet
          title={t('settings.desktops.rename')}
          onClose={() => setEditing(undefined)}
          footer={
            <button
              className="primary"
              disabled={!editing.name.trim()}
              onClick={() => {
                void haptic('light')
                rename(editing.id, editing.name.trim())
                setEditing(undefined)
              }}
            >
              {t('common.save')}
            </button>
          }
        >
          <label>
            {t('settings.desktops.name')}
            <input
              autoFocus
              className="rename-input"
              value={editing.name}
              onChange={(event) =>
                setEditing({ ...editing, name: event.target.value })
              }
            />
          </label>
        </BottomSheet>
      ) : null}
      {removing ? (
        <BottomSheet
          title={t('settings.desktops.removeTitle')}
          onClose={() => setRemoving(undefined)}
          footer={
            <button
              className="danger"
              onClick={() => {
                void haptic('light')
                remove(removing.id)
                setRemoving(undefined)
              }}
            >
              {t('settings.desktops.remove')}
            </button>
          }
        >
          <p>{t('settings.desktops.removeBody', { name: removing.name })}</p>
        </BottomSheet>
      ) : null}
    </section>
  )
}
