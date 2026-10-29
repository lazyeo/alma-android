import {
  AlarmClock,
  ArrowLeft,
  AtSign,
  ChevronDown,
  Bot,
  ExternalLink,
  File,
  FolderKanban,
  Gem,
  HardDrive,
  MessageCircle,
  MessageSquareText,
  Puzzle,
  Search,
  Sparkles,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { useConnection } from '../desktops/DesktopContext'
import { desktopReferencesPath } from '../desktopRoutes'
import type { RefCard, RefKind, RefResult } from '../relay'
import { haptic } from '../haptics'
import { mapRelayError } from './relayError'
import { useT } from '../i18n'
import {
  referenceEmptyCopy,
  referenceIconName,
  referenceNavigation,
  referenceSecondary,
  labelMissingFromRecent,
  splitMissingReferences,
  type ReferenceIconName,
} from './referenceBrowse'

const ICONS: Record<ReferenceIconName, LucideIcon> = {
  'alarm-clock': AlarmClock,
  'at-sign': AtSign,
  bot: Bot,
  file: File,
  'folder-kanban': FolderKanban,
  gem: Gem,
  'hard-drive': HardDrive,
  'message-circle': MessageCircle,
  'message-square-text': MessageSquareText,
  puzzle: Puzzle,
  sparkles: Sparkles,
  terminal: Terminal,
}

type BrowseRow = Pick<
  RefCard,
  'uri' | 'kind' | 'title' | 'subtitle' | 'summary'
> & { exists?: boolean }

function RefIcon({ kind }: { kind: string }) {
  const Icon = ICONS[referenceIconName(kind)]
  return <Icon size={17} aria-hidden="true" />
}

function ReferenceRow({
  item,
  count,
  missing = false,
  onOpen,
}: {
  item: BrowseRow
  count?: number
  /** The target was deleted; only the index rows pointing at it remain. */
  missing?: boolean
  onOpen(): void
}) {
  const t = useT()
  const secondary = missing
    ? t('library.references.noLongerExists')
    : referenceSecondary(item)
  return (
    <button
      className={`reference-row${missing ? ' missing' : ''}`}
      onClick={onOpen}
    >
      <span className="reference-kind-icon">
        <RefIcon kind={item.kind} />
      </span>
      <span className="reference-row-copy">
        <strong>{item.title}</strong>
        {secondary ? <small>{secondary}</small> : null}
      </span>
      {count ? <span className="reference-count">{count}</span> : null}
    </button>
  )
}

export function ReferencesScreen() {
  const t = useT()
  const { api, pairing } = useConnection()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedKind, setSelectedKind] = useState<string>()
  const [kinds, setKinds] = useState<RefKind[]>([])
  const [rows, setRows] = useState<BrowseRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMissing, setShowMissing] = useState(false)
  const { present, missing } = useMemo(
    () => splitMissingReferences(rows),
    [rows],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const trimmed = query.trim()
      const [kindResponse, rowResponse] = await Promise.all([
        api.listRefKinds(),
        trimmed
          ? api.searchRefs({
              q: trimmed,
              kinds: selectedKind ? [selectedKind] : undefined,
              limitPerKind: 20,
            })
          : api.listRecentRefs(selectedKind),
      ])
      const nextRows: BrowseRow[] = trimmed
        ? (rowResponse as { results: RefResult[] }).results
        : await (async () => {
            const recent = (
              rowResponse as Awaited<ReturnType<typeof api.listRecentRefs>>
            ).items
            const { results } = await api.resolveRefs(
              recent.map((item) => item.uri),
            )
            return labelMissingFromRecent(results, recent)
          })()
      setKinds(
        kindResponse.kinds.filter(
          (kind) =>
            kind.available &&
            nextRows.some(
              (row) => row.kind === kind.kind && row.exists !== false,
            ),
        ),
      )
      setRows(nextRows)
      setCounts(
        nextRows.length
          ? await api
              .backlinkCounts(nextRows.map((row) => row.uri))
              .then((r) => r.counts)
          : {},
      )
    } catch (cause) {
      setError(mapRelayError(cause).title)
      setRows([])
      setCounts({})
    } finally {
      setLoading(false)
    }
  }, [api, query, selectedKind])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query.trim() ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, query])

  return (
    <section className="root-page references-page">
      <ScopedRootHeader
        title={t('nav.references')}
        childOnPhone
        className="references-header"
      />
      <div className="references-tools">
        <label className="references-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('library.references.search')}
            aria-label={t('library.references.search')}
          />
          {query ? (
            <button
              aria-label={t('library.references.clearSearch')}
              onClick={() => setQuery('')}
            >
              <X size={16} />
            </button>
          ) : null}
        </label>
        <div className="ref-kind-chips references-kinds" role="toolbar">
          <button
            aria-pressed={!selectedKind}
            onClick={() => setSelectedKind(undefined)}
          >
            {t('library.references.all')}
          </button>
          {kinds.map((kind) => (
            <button
              key={kind.kind}
              aria-pressed={selectedKind === kind.kind}
              onClick={() => setSelectedKind(kind.kind)}
            >
              {kind.label}
            </button>
          ))}
        </div>
      </div>
      <div className="page-body references-body">
        {error ? (
          <button className="time-clue-error" onClick={() => void load()}>
            {t('library.references.retry', { error })}
          </button>
        ) : loading ? (
          <p className="empty">{t('common.loading')}</p>
        ) : rows.length ? (
          <>
            {present.length ? (
              <div className="reference-list">
                {present.map((row) => (
                  <ReferenceRow
                    key={row.uri}
                    item={row}
                    count={counts[row.uri]}
                    onOpen={() => {
                      void haptic('light')
                      navigate(desktopReferencesPath(pairing.id, row.uri))
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="empty">{referenceEmptyCopy(pairing.name)}</p>
            )}
            {missing.length ? (
              <>
                <button
                  className="reference-missing-toggle"
                  aria-expanded={showMissing}
                  onClick={() => setShowMissing((open) => !open)}
                >
                  {t('library.references.missing', { count: missing.length })}
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {showMissing ? (
                  <div className="reference-list reference-list-missing">
                    {missing.map((row) => (
                      <ReferenceRow
                        key={row.uri}
                        item={row}
                        missing
                        count={counts[row.uri]}
                        onOpen={() => {
                          void haptic('light')
                          navigate(desktopReferencesPath(pairing.id, row.uri))
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <p className="empty">
            {query.trim()
              ? t('library.references.noMatch')
              : referenceEmptyCopy(pairing.name)}
          </p>
        )}
      </div>
    </section>
  )
}

export function ReferenceDetailScreen() {
  const t = useT()
  const { referenceUri = '' } = useParams()
  const uri = decodeURIComponent(referenceUri)
  const { api, pairing } = useConnection()
  const navigate = useNavigate()
  const [card, setCard] = useState<RefCard>()
  const [backlinks, setBacklinks] = useState<
    Array<{
      threadId: string
      title?: string
      snippet?: string
      messageId?: string
    }>
  >([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setError('')
    Promise.all([api.resolveRef(uri, { full: true }), api.getBacklinks(uri)])
      .then(([nextCard, nextBacklinks]) => {
        if (cancelled) return
        setCard(nextCard)
        setBacklinks(nextBacklinks)
      })
      .catch((cause) => {
        if (!cancelled) setError(mapRelayError(cause).title)
      })
    return () => {
      cancelled = true
    }
  }, [api, uri])
  const destination = useMemo(
    () => (card ? referenceNavigation(pairing.id, card.uri, card) : undefined),
    [card, pairing.id],
  )
  return (
    <section className="root-page reference-detail-page">
      <header className="drill-header reference-detail-header">
        <button
          aria-label={t('common.back')}
          onClick={() =>
            navigate(desktopReferencesPath(pairing.id), { replace: true })
          }
        >
          <ArrowLeft size={20} />
        </button>
        <h1>{t('library.references.detailTitle')}</h1>
      </header>
      <div className="page-body reference-detail-body">
        {error ? (
          <p className="error">{error}</p>
        ) : !card ? (
          <p className="empty">{t('common.loading')}</p>
        ) : (
          <>
            <article className="reference-card">
              <span className="reference-kind-label">
                <RefIcon kind={card.kind} /> {card.kind}
              </span>
              <h2>{card.title}</h2>
              {referenceSecondary(card) ? (
                <p>{referenceSecondary(card)}</p>
              ) : null}
              {destination ? (
                <button
                  className="secondary reference-open"
                  onClick={() =>
                    navigate(destination.path, { state: destination.state })
                  }
                >
                  <ExternalLink size={16} /> {t('common.open')}
                </button>
              ) : null}
            </article>
            <section className="settings-section">
              <h2 className="settings-section-title">
                {t('library.references.referencedBy')}
              </h2>
              {backlinks.length ? (
                <div className="settings-group reference-list">
                  {backlinks.map((backlink, index) => (
                    <ReferenceRow
                      key={`${backlink.threadId}-${backlink.messageId ?? index}`}
                      item={{
                        uri: `alma://thread/${backlink.threadId}${backlink.messageId ? `/message/${backlink.messageId}` : ''}`,
                        kind: backlink.messageId ? 'message' : 'thread',
                        title:
                          backlink.title ||
                          t('library.references.threadFallback'),
                        summary: backlink.snippet,
                      }}
                      onOpen={() => {
                        const target = referenceNavigation(
                          pairing.id,
                          `alma://thread/${backlink.threadId}${backlink.messageId ? `/message/${backlink.messageId}` : ''}`,
                        )
                        if (target)
                          navigate(target.path, { state: target.state })
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty">{t('library.references.noBacklinks')}</p>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  )
}
