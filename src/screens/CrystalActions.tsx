import { useEffect, useState } from 'react'
import {
  Check,
  ChevronRight,
  Gem,
  LoaderCircle,
  Moon,
  RotateCcw,
  Target,
  WandSparkles,
  X,
} from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { SettingsRow } from '../components/SettingsRow'
import { useConnection } from '../desktops/DesktopContext'
import { validationMessage } from './crystals'
import type { CrystalDetail, CrystalOverview } from './crystals'
import { useT } from '../i18n'

type Action = 'slot' | 'dormant' | 'type' | 'confirm' | 'cancel' | 'prefill'
export function CrystalActions({
  crystal,
  onChanged,
}: {
  crystal: CrystalDetail
  onChanged(): void
}) {
  const { api, status } = useConnection()
  const t = useT()
  const [overview, setOverview] = useState<CrystalOverview>()
  const [busy, setBusy] = useState<Action>()
  const [error, setError] = useState('')
  const [typeRequired, setTypeRequired] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    action: Action
    value?: unknown
    title: string
    description: string
  }>()
  const [picker, setPicker] = useState<'slot' | 'type'>()
  useEffect(() => {
    let active = true
    api
      .getCrystalOverview()
      .then((value) => {
        if (active) setOverview(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, crystal.id])
  const run = async (action: Action, value?: unknown) => {
    setBusy(action)
    setError('')
    try {
      await api.crystalAction(crystal.id, action, value)
      setConfirmation(undefined)
      setTypeRequired(false)
      onChanged()
    } catch {
      setError(t('library.crystals.actions.failed'))
    } finally {
      setBusy(undefined)
    }
  }
  const validate = async () => {
    if (!crystal.type) {
      setTypeRequired(true)
      setError(
        t('library.crystals.actions.missing', {
          fields: t('library.crystals.actions.type'),
        }),
      )
      return
    }
    setBusy('confirm')
    setError('')
    try {
      const result = await api.crystalAction(crystal.id, 'validate')
      const message = validationMessage(result, crystal.checklist)
      if (result.ready === true)
        setConfirmation({
          action: 'confirm',
          title: t('library.crystals.actions.confirmTitle'),
          description: t('library.crystals.actions.confirmBody'),
        })
      else setError(message || t('library.crystals.actions.notReady'))
    } catch {
      setError(t('library.crystals.actions.validationUnavailable'))
    } finally {
      setBusy(undefined)
    }
  }
  const spinner = (action: Action) =>
    busy === action ? (
      <LoaderCircle
        className="spinner"
        size={16}
        aria-label={t('library.crystals.actions.working')}
      />
    ) : undefined
  const typeValue = crystal.type || t('library.crystals.actions.choose')
  return (
    <section className="settings-section crystal-actions">
      <h2 className="settings-section-title">
        {t('library.crystals.actions.title')}
      </h2>
      <fieldset disabled={!!busy || status !== 'online'}>
        <div className="settings-group">
          {crystal.slot !== undefined ? (
            <SettingsRow
              icon={<RotateCcw size={17} />}
              title={t('library.crystals.actions.recall')}
              trailing={spinner('slot')}
              onClick={() => void run('slot', null)}
            />
          ) : crystal.origin === 'seed' ? (
            <SettingsRow
              icon={<Target size={17} />}
              title={t('library.crystals.actions.place')}
              trailing={
                spinner('slot') ?? (
                  <ChevronRight className="settings-chevron" size={16} />
                )
              }
              onClick={() => setPicker('slot')}
            />
          ) : null}
          <SettingsRow
            icon={<Moon size={17} />}
            title={
              crystal.dormant
                ? t('library.crystals.actions.wake')
                : t('library.crystals.actions.makeDormant')
            }
            trailing={spinner('dormant')}
            onClick={() => void run('dormant', !crystal.dormant)}
          />
          {overview?.types.length ? (
            <SettingsRow
              icon={<Gem size={17} />}
              title={t('library.crystals.actions.type')}
              trailing={
                spinner('type') ?? (
                  <span className="settings-row-trailing">
                    <span
                      className={`settings-value crystal-type-value${
                        !crystal.type ? ' unset' : ''
                      }${typeRequired ? ' required' : ''}`}
                    >
                      {typeValue}
                    </span>
                    <ChevronRight className="settings-chevron" size={16} />
                  </span>
                )
              }
              onClick={() => {
                setTypeRequired(false)
                setPicker('type')
              }}
            />
          ) : null}
          {crystal.type && crystal.stage !== 'formal' ? (
            <SettingsRow
              icon={<WandSparkles size={17} />}
              title={t('library.crystals.actions.prefill')}
              trailing={spinner('prefill')}
              onClick={() => void run('prefill')}
            />
          ) : null}
          {crystal.stage !== 'formal' ? (
            <SettingsRow
              icon={<Check size={17} />}
              title={t('library.crystals.actions.validate')}
              trailing={spinner('confirm')}
              onClick={() => void validate()}
            />
          ) : null}
          <SettingsRow
            danger
            icon={<X size={17} />}
            title={t('library.crystals.actions.cancel')}
            trailing={spinner('cancel')}
            onClick={() =>
              setConfirmation({
                action: 'cancel',
                title: t('library.crystals.actions.cancelTitle'),
                description: t('library.crystals.actions.cancelBody'),
              })
            }
          />
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
      {picker ? (
        <BottomSheet
          title={
            picker === 'slot'
              ? t('library.crystals.actions.place')
              : t('library.crystals.actions.typeSheet')
          }
          onClose={() => setPicker(undefined)}
        >
          <div className="sheet-list">
            {picker === 'slot'
              ? Array.from(
                  { length: overview?.slotCapacity || 3 },
                  (_, index) => index + 1,
                ).map((slot) => {
                  const occupied = overview?.slots.some(
                    (candidate) => candidate.slot === slot,
                  )
                  return (
                    <button
                      className="sheet-row compact"
                      key={slot}
                      disabled={occupied}
                      onClick={() => {
                        setPicker(undefined)
                        void run('slot', slot)
                      }}
                    >
                      {t('library.crystals.slot', { slot })}
                      {occupied ? (
                        <small>{t('library.crystals.actions.occupied')}</small>
                      ) : null}
                    </button>
                  )
                })
              : overview?.types.map((type) => (
                  <button
                    className={`sheet-row compact${type === crystal.type ? ' selected' : ''}`}
                    aria-current={type === crystal.type ? 'true' : undefined}
                    key={type}
                    onClick={() => {
                      setPicker(undefined)
                      setConfirmation({
                        action: 'type',
                        value: type,
                        title: t('library.crystals.actions.typeTitle'),
                        description: t('library.crystals.actions.typeBody'),
                      })
                    }}
                  >
                    <span>{type}</span>
                    {type === crystal.type ? <Check size={18} /> : null}
                  </button>
                ))}
          </div>
        </BottomSheet>
      ) : null}
      {confirmation ? (
        <BottomSheet
          title={confirmation.title}
          onClose={() => {
            if (!busy) setConfirmation(undefined)
          }}
          footer={
            <button
              className={
                confirmation.action === 'cancel' ? 'danger' : 'primary'
              }
              disabled={!!busy}
              onClick={() => void run(confirmation.action, confirmation.value)}
            >
              {busy
                ? t('library.crystals.actions.workingEllipsis')
                : t('common.confirm')}
            </button>
          }
        >
          <p>{confirmation.description}</p>
          {error ? <p className="settings-error">{error}</p> : null}
        </BottomSheet>
      ) : null}
    </section>
  )
}
