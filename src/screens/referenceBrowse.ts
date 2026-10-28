import { desktopCrystalsPath, desktopThreadPath } from '../desktopRoutes'
import type { RefCard, RefResult } from '../relay'
import { t } from '../i18n/runtime'

export type ReferenceIconName =
  | 'alarm-clock'
  | 'at-sign'
  | 'bot'
  | 'file'
  | 'folder-kanban'
  | 'gem'
  | 'hard-drive'
  | 'message-circle'
  | 'message-square-text'
  | 'puzzle'
  | 'sparkles'
  | 'terminal'

const ICON_NAMES: Record<string, ReferenceIconName> = {
  agent: 'bot',
  crystal: 'gem',
  date: 'alarm-clock',
  file: 'file',
  host: 'hard-drive',
  message: 'message-square-text',
  project: 'folder-kanban',
  prompt: 'terminal',
  skill: 'sparkles',
  task: 'puzzle',
  thread: 'message-circle',
}

export const referenceIconName = (kind: string): ReferenceIconName =>
  ICON_NAMES[kind] ?? 'at-sign'

export interface ReferenceNavigation {
  path: string
  state?: { fromSearch: true; searchRowId: string }
}

export function referenceNavigation(
  desktopId: string,
  uri: string,
  card?: Pick<RefCard, 'nav'>,
): ReferenceNavigation | undefined {
  const match = /^alma:\/\/([^/]+)\/([^/?#]+)(?:\/message\/([^/?#]+))?/.exec(
    uri,
  )
  const kind = match?.[1]
  const id = match?.[2] ? decodeURIComponent(match[2]) : undefined
  const messageId =
    card?.nav?.messageId ??
    (match?.[3] ? decodeURIComponent(match[3]) : undefined)
  const threadId = card?.nav?.threadId ?? (kind === 'thread' ? id : undefined)
  if (threadId)
    return {
      path: desktopThreadPath(desktopId, threadId),
      ...(messageId
        ? { state: { fromSearch: true as const, searchRowId: messageId } }
        : {}),
    }
  if (kind === 'crystal' && id)
    return { path: desktopCrystalsPath(desktopId, id) }
  return undefined
}

export const referenceSecondary = (
  item: Pick<RefCard, 'summary' | 'subtitle'> | Pick<RefResult, 'subtitle'>,
) => ('summary' in item && item.summary ? item.summary : item.subtitle) ?? ''

export const referenceEmptyCopy = (desktopName: string) =>
  t('library.references.empty', { desktop: desktopName })

/**
 * Desktop keeps index rows whose target was deleted (a deleted thread only
 * drops the links it made), so recent can list objects that no longer
 * resolve. Those stay out of the main list; search results always exist.
 */
export function splitMissingReferences<T extends { exists?: boolean }>(
  rows: T[],
) {
  return {
    present: rows.filter((row) => row.exists !== false),
    missing: rows.filter((row) => row.exists === false),
  }
}

/**
 * resolve names a deleted target by its bare id; the recent index still has
 * the label it was mentioned with, which is the only recognisable name left.
 */
export function labelMissingFromRecent<
  T extends { uri: string; exists?: boolean; title: string },
>(cards: T[], recent: Array<{ uri: string; label?: string | null }>) {
  const labels = new Map(
    recent.map((item) => [item.uri, item.label?.trim()] as const),
  )
  return cards.map((card) =>
    card.exists === false && labels.get(card.uri)
      ? { ...card, title: labels.get(card.uri)! }
      : card,
  )
}
