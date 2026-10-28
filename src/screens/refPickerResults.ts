import type { RefCard, RefKind, RefRecentItem, Thread } from '../relay'
import { t } from '../i18n/runtime'

export interface RefPickItem {
  uri: string
  kind: string
  title: string
  subtitle?: string
}

const HIDDEN_DEFAULT_KINDS = new Set(['task', 'host', 'provider', 'module'])

export function defaultRefKinds(kinds: RefKind[]) {
  return kinds.filter((item) => !HIDDEN_DEFAULT_KINDS.has(item.kind))
}

export function filterRecentRefItems(
  recent: RefRecentItem[],
  resolved: RefCard[],
): RefPickItem[] {
  const cards = new Map(resolved.map((item) => [item.uri, item]))
  const seenUris = new Set<string>()
  const seenLabels = new Set<string>()
  const items: RefPickItem[] = []
  for (const item of recent) {
    const card = cards.get(item.uri)
    if (!card?.exists || seenUris.has(item.uri)) continue
    const title = card.title || item.label
    const labelKey = `${card.kind || item.kind}\u0000${title}`
    if (seenLabels.has(labelKey)) continue
    seenUris.add(item.uri)
    seenLabels.add(labelKey)
    items.push({
      uri: item.uri,
      kind: card.kind || item.kind,
      title,
      subtitle: card.subtitle,
    })
  }
  return items
}

const activityTime = (value: string | number | undefined) => {
  if (typeof value === 'number') return value
  const parsed = value ? Date.parse(value) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

export function recentThreadRefItems(threads: Thread[]): RefPickItem[] {
  return threads
    .filter((thread) => !thread.parentThreadId && !thread.isIncognito)
    .sort(
      (a, b) =>
        activityTime(b.updatedAt ?? b.createdAt) -
        activityTime(a.updatedAt ?? a.createdAt),
    )
    .slice(0, 5)
    .map((thread) => ({
      uri: `alma://thread/${thread.id}`,
      kind: 'thread',
      title: thread.title || t('thread.untitled'),
    }))
}
