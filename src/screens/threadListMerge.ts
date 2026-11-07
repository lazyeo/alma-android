import type { Thread } from '../relay'

const time = (value: Thread['updatedAt']) => {
  const parsed = typeof value === 'number' ? value : Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Folds a `GET /api/threads` answer into the rows on screen without letting
 * it undo anything newer than the request. A slow fetch can land after a
 * live event (generating, a title) or a local edit (rename, delete, a GTD
 * move) already changed a row, so a row stays local when (`requestedAt`
 * and `touchedAt` read the same caller-owned clock):
 *
 * - it was touched after the request went out (`touchedAt`), or
 * - its `updatedAt` is newer than the fetched copy.
 *
 * A row touched after the request but missing from the answer was either
 * deleted here (already gone locally) or is newer than the answer, so the
 * local state wins either way. Everything else is the answer, in its order.
 */
export function mergeThreadList(
  local: readonly Thread[],
  fetched: readonly Thread[],
  requestedAt: number,
  touchedAt: ReadonlyMap<string, number>,
): Thread[] {
  const localById = new Map(local.map((row) => [row.id, row]))
  const newer = (id: string) => (touchedAt.get(id) ?? -Infinity) > requestedAt
  const merged: Thread[] = []
  const seen = new Set<string>()
  for (const row of fetched) {
    seen.add(row.id)
    const mine = localById.get(row.id)
    if (newer(row.id)) {
      if (mine) merged.push(mine)
      continue
    }
    merged.push(mine && time(mine.updatedAt) > time(row.updatedAt) ? mine : row)
  }
  const kept = local.filter((row) => !seen.has(row.id) && newer(row.id))
  return kept.length ? [...kept, ...merged] : merged
}

/** Ids whose row object changed, appeared, or went away between two lists. */
export function changedThreadIds(
  before: readonly Thread[],
  after: readonly Thread[],
): string[] {
  const prior = new Map(before.map((row) => [row.id, row]))
  const changed: string[] = []
  for (const row of after) {
    if (prior.get(row.id) !== row) changed.push(row.id)
    prior.delete(row.id)
  }
  return [...changed, ...prior.keys()]
}
