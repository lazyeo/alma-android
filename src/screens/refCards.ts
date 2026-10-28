import { desktopCrystalsPath, desktopThreadPath } from '../desktopRoutes'
import type { RefCard } from '../relay'

export interface RefBacklink {
  threadId: string
  messageId?: string
  title?: string
  snippet?: string
  at?: string | number
}

const segment = (uri: string) => {
  const match = /^alma:\/\/([^/]+)\/([^/?#]+)/.exec(uri)
  return match && { kind: match[1], id: decodeURIComponent(match[2]) }
}

/** In-app route for a reference, or undefined when mobile has no screen for it. */
export function refDestination(
  desktopId: string,
  card: Pick<RefCard, 'uri'> & Partial<Pick<RefCard, 'nav'>>,
) {
  if (card.nav?.threadId) return desktopThreadPath(desktopId, card.nav.threadId)
  const target = segment(card.uri)
  if (target?.kind === 'thread') return desktopThreadPath(desktopId, target.id)
  if (target?.kind === 'crystal')
    return desktopCrystalsPath(desktopId, target.id)
  return undefined
}

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined

/** GET /api/refs/backlinks rows; tolerant because desktop versions differ. */
export function parseBacklinks(value: unknown): RefBacklink[] {
  const input = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >
  const rows = [input.backlinks, input.items, input.results].find(
    Array.isArray,
  ) as unknown[] | undefined
  return (rows ?? []).flatMap((raw) => {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<
      string,
      unknown
    >
    const threadId = text(row.threadId) ?? text(row.thread_id)
    if (!threadId) return []
    const messageId = text(row.messageId) ?? text(row.message_id)
    const title = text(row.threadTitle) ?? text(row.title)
    const snippet = text(row.snippet) ?? text(row.excerpt)
    const at = row.createdAt ?? row.updatedAt ?? row.at
    return [
      {
        threadId,
        ...(messageId ? { messageId } : {}),
        ...(title ? { title } : {}),
        ...(snippet ? { snippet } : {}),
        ...(typeof at === 'string' || typeof at === 'number' ? { at } : {}),
      },
    ]
  })
}
