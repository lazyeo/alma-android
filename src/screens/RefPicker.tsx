import {
  AtSign,
  FileText,
  Gem,
  ListChecks,
  MessagesSquare,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  isUnsupportedEndpoint,
  type AlmaApi,
  type RefCard,
  type RefKind,
  type Thread,
} from '../relay'
import type { RefTrigger } from './refTrigger'
import { t as runtimeT, useT } from '../i18n'
import { LoadingOrb } from './LoadingOrbCanvas'
import {
  defaultRefKinds,
  filterRecentRefItems,
  recentThreadRefItems,
  type RefPickItem,
} from './refPickerResults'

export type { RefPickItem } from './refPickerResults'

// Keystrokes are coalesced so a fast typist costs one relay search, not one per letter.
const SEARCH_DEBOUNCE_MS = 180
type CachedRecentRef = RefPickItem & { exists: boolean }
const recentResolutionCache = new WeakMap<
  AlmaApi,
  Map<string, CachedRecentRef>
>()

const KIND_ICONS: Record<string, typeof AtSign> = {
  thread: MessagesSquare,
  crystal: Gem,
  skill: WandSparkles,
  plan: ListChecks,
  file: FileText,
}

export function RefKindIcon({
  kind,
  size = 15,
}: {
  kind: string
  size?: number
}) {
  const Icon = KIND_ICONS[kind] ?? AtSign
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}

/**
 * Reference kinds double as feature detection: `null` until known, `[]` when
 * the desktop predates `/api/refs` (the @ trigger then stays plain text).
 */
export function useRefKinds(api: AlmaApi) {
  const [kinds, setKinds] = useState<RefKind[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .listRefKinds()
      .then(({ kinds: available }) => {
        if (cancelled) return
        setKinds(
          (Array.isArray(available) ? available : [])
            .filter((item) => item.available !== false)
            .sort((a, b) => a.order - b.order),
        )
      })
      .catch((kindsError) => {
        if (cancelled) return
        if (!isUnsupportedEndpoint(kindsError))
          console.warn('Reference kinds unavailable', kindsError)
        setKinds([])
      })
    return () => {
      cancelled = true
    }
  }, [api])
  return kinds
}

/** Recents for an empty query, debounced search otherwise; stale replies are dropped. */
export function useRefResults(
  api: AlmaApi,
  trigger: RefTrigger | undefined,
  chipKind: string | undefined,
  scope: { threadId?: string; workspaceId?: string; threads?: Thread[] },
) {
  const [items, setItems] = useState<RefPickItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const open = Boolean(trigger)
  const query = trigger?.query.trim() ?? ''
  const kind = trigger?.kind ?? chipKind
  const { threadId, workspaceId, threads = [] } = scope
  useEffect(() => {
    if (!open) {
      setItems([])
      return
    }
    let cancelled = false
    setLoading(true)
    const run = async () => {
      try {
        let next: RefPickItem[]
        if (query) {
          next = (
            await api.searchRefs({
              q: query,
              kinds: kind ? [kind] : undefined,
              limitPerKind: 8,
              threadId,
              workspaceId: workspaceId || undefined,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })
          ).results.map(({ uri, kind: itemKind, title, subtitle }) => ({
            uri,
            kind: itemKind,
            title,
            subtitle,
          }))
        } else {
          const recent = (await api.listRecentRefs(kind)).items
          let cache = recentResolutionCache.get(api)
          if (!cache) {
            cache = new Map()
            recentResolutionCache.set(api, cache)
          }
          const uniqueUris = [...new Set(recent.map((item) => item.uri))].slice(
            0,
            64,
          )
          const missing = uniqueUris.filter((uri) => !cache!.has(uri))
          if (missing.length) {
            const { results } = await api.resolveRefs(missing, { threadId })
            for (const card of results) {
              cache.set(card.uri, {
                uri: card.uri,
                kind: card.kind,
                title: card.title,
                subtitle: card.subtitle,
                exists: card.exists,
              })
            }
            for (const uri of missing) {
              if (!results.some((card) => card.uri === uri && card.exists)) {
                cache.set(uri, {
                  uri,
                  kind: '',
                  title: '',
                  exists: false,
                })
              }
            }
          }
          const resolved: RefCard[] = uniqueUris.map((uri) => {
            const item = cache!.get(uri)!
            return {
              ...item,
              id: uri,
              exists: item.exists,
            }
          })
          next = filterRecentRefItems(recent, resolved)
          if (!next.length && !kind) next = recentThreadRefItems(threads)
        }
        if (cancelled) return
        setItems(next)
        setError('')
      } catch (searchError) {
        if (cancelled) return
        setItems([])
        setError(
          searchError instanceof Error
            ? searchError.message
            : runtimeT('library.references.picker.searchFailed'),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const timer = setTimeout(() => void run(), query ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [api, open, query, kind, threadId, workspaceId])
  return { items, loading, error }
}

/** Docked above the composer; buttons keep focus in the textarea. */
export function RefPicker({
  kinds,
  trigger,
  chipKind,
  onChipKind,
  items,
  loading,
  error,
  onPick,
  onClose,
}: {
  kinds: RefKind[]
  trigger: RefTrigger
  chipKind?: string
  onChipKind(kind: string | undefined): void
  items: RefPickItem[]
  loading: boolean
  error: string
  onPick(item: RefPickItem): void
  onClose(): void
}) {
  const t = useT()
  const activeKind = trigger.kind ?? chipKind
  const visibleKinds = trigger.kind ? kinds : defaultRefKinds(kinds)
  // A pointerdown that blurs the textarea would close the keyboard mid-pick.
  const keepFocus = (event: React.PointerEvent) => event.preventDefault()
  return (
    <section
      className="ref-picker"
      aria-label={t('library.references.picker.label')}
    >
      <header className="ref-picker-header">
        <div
          className="ref-kind-chips"
          role="toolbar"
          aria-label={t('library.references.picker.kinds')}
        >
          <button
            aria-pressed={!activeKind}
            disabled={Boolean(trigger.kind)}
            onPointerDown={keepFocus}
            onClick={() => onChipKind(undefined)}
          >
            {t('library.references.all')}
          </button>
          {visibleKinds.map((item) => (
            <button
              key={item.kind}
              aria-pressed={activeKind === item.kind}
              disabled={Boolean(trigger.kind) && trigger.kind !== item.kind}
              onPointerDown={keepFocus}
              onClick={() =>
                onChipKind(chipKind === item.kind ? undefined : item.kind)
              }
            >
              <RefKindIcon kind={item.kind} size={13} />
              {item.label}
            </button>
          ))}
        </div>
        <button
          className="ref-picker-close"
          aria-label={t('library.references.picker.close')}
          onPointerDown={keepFocus}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <p className="ref-picker-caption">
        {trigger.query.trim()
          ? t('library.references.picker.resultsFor', {
              query: trigger.query.trim(),
            })
          : t('library.references.picker.recent')}
        {loading ? <LoadingOrb size={13} /> : null}
      </p>
      <div className="ref-picker-list" role="listbox">
        {items.map((item, index) => (
          <button
            key={item.uri}
            role="option"
            aria-selected={index === 0}
            className="ref-picker-row"
            onPointerDown={keepFocus}
            onClick={() => onPick(item)}
          >
            <RefKindIcon kind={item.kind} />
            <span>
              <strong>{item.title}</strong>
              {item.subtitle ? <small>{item.subtitle}</small> : null}
            </span>
          </button>
        ))}
        {!loading && !items.length ? (
          <p className="ref-picker-empty">
            {error ||
              (trigger.query.trim()
                ? t('library.references.picker.noMatches')
                : t('library.references.picker.noRecent'))}
          </p>
        ) : null}
      </div>
    </section>
  )
}
