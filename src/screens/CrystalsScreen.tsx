import { CrystalActions } from './CrystalActions'
import { BottomSheet } from '../components/BottomSheet'
import {
  ArrowLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  FileText,
  Gem,
  LoaderCircle,
  Moon,
  RefreshCw,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConnection } from '../desktops/DesktopContext'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { desktopCrystalsPath, desktopThreadPath } from '../desktopRoutes'
import { isUnsupportedEndpoint } from '../relay'
import { t as runtimeT, useT } from '../i18n'
import {
  applyMaterialResolutions,
  checklistSaveBody,
  materialUris,
  type CrystalChecklistItem,
  type CrystalDetail,
  type CrystalOverview,
  type CrystalSummary,
} from './crystals'

type Load<T> =
  | { status: 'loading' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T }

/** One read-only GET; a 404/405/501 means this desktop predates Crystals. */
function useCrystalLoad<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetcher()
      .then((value) => !cancelled && setState({ status: 'ready', value }))
      .catch((loadError) => {
        if (cancelled) return
        setState(
          isUnsupportedEndpoint(loadError)
            ? { status: 'unsupported' }
            : {
                status: 'error',
                message:
                  loadError instanceof Error
                    ? loadError.message
                    : runtimeT('library.crystals.loadFailed'),
              },
        )
      })
    return () => {
      cancelled = true
    }
  }, [fetcher, attempt])
  return { state, retry: () => setAttempt((value) => value + 1) }
}

function CrystalsPage({
  title,
  onBack,
  pinned,
  children,
}: {
  title: string
  onBack?: () => void
  pinned?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  return (
    <section className="root-page crystals-page">
      {onBack ? (
        <header className="crystals-header">
          <button aria-label={t('common.back')} onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
          <h1>{title}</h1>
        </header>
      ) : (
        <ScopedRootHeader title={title} childOnPhone />
      )}
      {pinned ? <div className="crystals-pinned">{pinned}</div> : null}
      <div className="page-body crystals-page-body">{children}</div>
    </section>
  )
}

function LoadState({
  state,
  retry,
}: {
  state: Exclude<Load<unknown>, { status: 'ready' }>
  retry(): void
}) {
  const t = useT()
  if (state.status === 'loading')
    return (
      <p className="crystals-note">
        <LoaderCircle className="spinner" size={16} /> {t('common.loading')}
      </p>
    )
  if (state.status === 'unsupported')
    return (
      <div className="crystals-empty">
        <Gem size={28} strokeWidth={1.6} aria-hidden="true" />
        <h2>{t('library.crystals.unavailable')}</h2>
        <p>{t('library.crystals.unavailableDetail')}</p>
      </div>
    )
  return (
    <div className="crystals-empty">
      <p className="crystals-note error">{state.message}</p>
      <button className="secondary" onClick={retry}>
        <RefreshCw size={16} /> {t('common.retry')}
      </button>
    </div>
  )
}

function CrystalRow({
  crystal,
  onOpen,
}: {
  crystal: CrystalSummary
  onOpen(): void
}) {
  const t = useT()
  return (
    <button className="crystal-row" onClick={onOpen}>
      <Gem size={17} aria-hidden="true" />
      <span className="crystal-row-copy">
        <strong>{crystal.name}</strong>
        <small>{crystal.type || t('library.crystals.fallbackName')}</small>
      </span>
      {crystal.dormant ? (
        <span className="crystal-badge">
          <Moon size={12} aria-hidden="true" /> {t('library.crystals.dormant')}
        </span>
      ) : null}
      <ChevronRight size={16} className="settings-chevron" />
    </button>
  )
}

export function CrystalsScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { api, pairing } = useConnection()
  const fetcher = useCallback(() => api.getCrystalOverview(), [api])
  const { state, retry } = useCrystalLoad<CrystalOverview>(fetcher)
  const [type, setType] = useState<string>()
  const open = (crystal: CrystalSummary) =>
    navigate(desktopCrystalsPath(pairing.id, crystal.id))
  const sections = (overview: CrystalOverview) =>
    (
      [
        ['slots', overview.slots],
        ['backpack', overview.backpack],
        ['formal', overview.formal],
      ] as const
    ).map(
      ([title, rows]) =>
        [title, type ? rows.filter((row) => row.type === type) : rows] as const,
    )
  const totalCrystals =
    state.status === 'ready'
      ? state.value.slots.length +
        state.value.backpack.length +
        state.value.formal.length
      : 0
  const renderSection = (
    section: 'slots' | 'backpack' | 'formal',
    rows: readonly CrystalSummary[],
  ) => (
    <section key={section} className="settings-section">
      <h2 className="settings-section-title">
        {t(`library.crystals.sections.${section}`)}
      </h2>
      {rows.length ? (
        <div className="settings-group">
          {rows.map((crystal) => (
            <CrystalRow
              key={crystal.id}
              crystal={crystal}
              onOpen={() => open(crystal)}
            />
          ))}
        </div>
      ) : (
        <p className="crystals-note">{t('library.crystals.nothingHere')}</p>
      )}
    </section>
  )
  return (
    <CrystalsPage
      title={t('nav.crystals')}
      pinned={
        state.status === 'ready' ? (
          <>
            <dl className="crystals-stats">
              <div>
                <dt>{t('library.crystals.sections.slots')}</dt>
                <dd>
                  {state.value.slots.length}/{state.value.slotCapacity}
                </dd>
              </div>
              <div>
                <dt>{t('library.crystals.sections.backpack')}</dt>
                <dd>{state.value.backpack.length}</dd>
              </div>
              <div>
                <dt>{t('library.crystals.contours')}</dt>
                <dd>{state.value.contourCount}</dd>
              </div>
            </dl>
            {state.value.types.length ? (
              <div className="ref-kind-chips crystals-types" role="toolbar">
                <button aria-pressed={!type} onClick={() => setType(undefined)}>
                  {t('library.crystals.all')}
                </button>
                {state.value.types.map((item) => (
                  <button
                    key={item}
                    aria-pressed={type === item}
                    onClick={() => setType(type === item ? undefined : item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
            {/* Slots are capped (slotCapacity), so they stay with the stats. */}
            {/* With no crystals at all the body says so once; an empty Slots
                section on top would repeat it. */}
            {sections(state.value)
              .filter(([section]) => section === 'slots' && totalCrystals > 0)
              .map(([title, rows]) => renderSection(title, rows))}
          </>
        ) : null
      }
    >
      {state.status !== 'ready' ? (
        <LoadState state={state} retry={retry} />
      ) : totalCrystals === 0 ? (
        <p className="empty">
          {t('library.crystals.empty', { desktop: pairing.name })}
        </p>
      ) : (
        <>
          {sections(state.value)
            .filter(([section]) => section !== 'slots')
            .map(([title, rows]) => renderSection(title, rows))}
        </>
      )}
    </CrystalsPage>
  )
}

const statValue = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''

export function CrystalDetailScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { crystalId = '' } = useParams()
  const { api, pairing } = useConnection()
  const fetcher = useCallback(() => api.getCrystal(crystalId), [api, crystalId])
  const { state, retry } = useCrystalLoad<CrystalDetail>(fetcher)
  const crystal = state.status === 'ready' ? state.value : undefined
  const [materialCards, setMaterialCards] = useState<
    Awaited<ReturnType<typeof api.resolveRefs>>['results']
  >([])
  const materialList = useMemo(
    () =>
      crystal ? applyMaterialResolutions(crystal.materials, materialCards) : [],
    [crystal, materialCards],
  )
  useEffect(() => {
    let cancelled = false
    const uris = materialUris(crystal?.materials ?? [])
    setMaterialCards([])
    if (!uris.length) return
    api
      .resolveRefs(uris)
      .then(({ results }) => {
        if (!cancelled) setMaterialCards(results)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, crystal])
  const [editing, setEditing] = useState<CrystalChecklistItem>()
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const stats = Object.entries(crystal?.termStats ?? {}).filter(([, value]) =>
    statValue(value),
  )
  const openChecklist = (item: CrystalChecklistItem) => {
    setEditing(item)
    setEditValue(item.value ?? '')
    setEditError('')
  }
  const saveChecklist = async () => {
    if (!editing) return
    setSaving(true)
    setEditError('')
    try {
      await api.crystalAction(
        crystalId,
        'checklist',
        checklistSaveBody(editing.key, {
          value: editValue,
          sources: editing.sources?.length
            ? editing.sources
            : editValue.trim()
              ? ['user:manual']
              : [],
          ...(typeof editing.conflict === 'boolean'
            ? { conflict: editing.conflict }
            : {}),
        }),
      )
      setEditing(undefined)
      retry()
    } catch {
      setEditError(t('library.crystals.checklistSaveFailed'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <CrystalsPage
      title={crystal?.name ?? t('library.crystals.fallbackName')}
      onBack={() => navigate(desktopCrystalsPath(pairing.id))}
    >
      {!crystal ? (
        state.status !== 'ready' ? (
          <LoadState state={state} retry={retry} />
        ) : null
      ) : (
        <>
          <div className="crystal-meta">
            {crystal.stage ? <span>{crystal.stage}</span> : null}
            {crystal.type ? <span>{crystal.type}</span> : null}
            {crystal.slot !== undefined ? (
              <span>{t('library.crystals.slot', { slot: crystal.slot })}</span>
            ) : null}
            {crystal.dormant ? (
              <span>
                <Moon size={12} aria-hidden="true" />{' '}
                {t('library.crystals.dormant')}
              </span>
            ) : null}
          </div>
          <CrystalActions crystal={crystal} onChanged={retry} />
          {crystal.checklist.length ? (
            <section className="settings-section">
              <h2 className="settings-section-title">
                {t('library.crystals.checklist')}
              </h2>
              <div className="crystal-checklist">
                {crystal.checklist.map((item) => (
                  <button
                    key={item.key}
                    className={item.complete ? 'done' : ''}
                    disabled={crystal.stage === 'formal'}
                    onClick={() => openChecklist(item)}
                  >
                    {item.complete ? (
                      <CircleCheck
                        size={16}
                        aria-label={t('library.crystals.complete')}
                      />
                    ) : (
                      <Circle
                        size={16}
                        aria-label={t('library.crystals.open')}
                      />
                    )}
                    <span>
                      <strong>{item.label}</strong>
                      <small className="crystal-field-value">
                        {item.value || t('library.crystals.emptyValue')}
                      </small>
                    </span>
                    <span className="crystal-checklist-meta">
                      {t('library.crystals.sources', {
                        count: item.sources?.length ?? 0,
                      })}
                      {crystal.stage !== 'formal' ? (
                        <ChevronRight className="settings-chevron" size={16} />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : crystal.checklistRecognized ? null : (
            <p className="settings-section-note">
              {t('library.crystals.checklistUnrecognised')}
            </p>
          )}
          <section className="settings-section">
            <h2 className="settings-section-title settings-section-title-count">
              <span>{t('library.crystals.materials')}</span>
              <span>{crystal.materials.length}</span>
            </h2>
            {materialList.length ? (
              <div className="settings-group crystal-materials">
                {materialList.map((material, index) => (
                  <button
                    className={`settings-row${material.unavailable ? ' unavailable' : ''}`}
                    key={material.id ?? `${material.title}-${index}`}
                    disabled={material.unavailable || !material.threadId}
                    onClick={() => {
                      if (!material.threadId) return
                      navigate(
                        desktopThreadPath(pairing.id, material.threadId),
                        {
                          state: material.anchorId
                            ? {
                                fromSearch: true,
                                searchRowId: material.anchorId,
                              }
                            : undefined,
                        },
                      )
                    }}
                  >
                    <span className="settings-icon">
                      <FileText size={17} />
                    </span>
                    <span className="settings-copy">
                      <strong>{material.title}</strong>
                      {material.secondary ? (
                        // Thread title and date are separate text runs.
                        <small className="crystal-material-meta">
                          {material.secondary.split('  ').map((part) => (
                            <span key={part}>{part}</span>
                          ))}
                        </small>
                      ) : null}
                    </span>
                    {!material.unavailable && material.threadId ? (
                      <ChevronRight className="settings-chevron" size={16} />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="crystals-note">
                {t('library.crystals.noMaterials')}
              </p>
            )}
          </section>
          {stats.length || crystal.related.length ? (
            <section className="settings-section">
              <h2 className="settings-section-title">
                {t('library.crystals.signals')}
              </h2>
              <dl className="crystals-stats">
                {crystal.related.length ? (
                  <div>
                    <dt>{t('library.crystals.related')}</dt>
                    <dd>{crystal.related.length}</dd>
                  </div>
                ) : null}
                {stats.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{statValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {editing ? (
            <BottomSheet
              title={editing.label}
              onClose={() => {
                if (!saving) setEditing(undefined)
              }}
              footer={
                <button
                  className="primary checklist-save"
                  disabled={saving}
                  onClick={() => void saveChecklist()}
                >
                  {saving ? t('library.crystals.saving') : t('common.save')}
                </button>
              }
            >
              <label className="checklist-field">
                {t('library.crystals.value')}
                <textarea
                  autoFocus
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                />
              </label>
              {editing.sources?.length ? (
                <div className="checklist-sources">
                  <strong>{t('library.crystals.sourcesTitle')}</strong>
                  <div>
                    {editing.sources.map((source) => (
                      <span key={source}>{source}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {editError ? <p className="settings-error">{editError}</p> : null}
            </BottomSheet>
          ) : null}
        </>
      )}
    </CrystalsPage>
  )
}
