import { t } from '../i18n/runtime'
import { routingId } from './crypto'
import type { PairingConfig } from './e2eSession'

export const LEGACY_PAIRING_KEY = 'alma-mobile.pairing.v1'
export const PAIRINGS_KEY = 'alma-mobile.pairings.v2'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StoredPairing extends PairingConfig {
  id: string
  name: string
  addedAt: number
  lastActiveAt: number
  /**
   * 'user' once renamed locally, so re-pairing keeps the chosen name. Absent
   * on entries saved before the marker existed; those count as 'auto'.
   */
  nameSource?: 'auto' | 'user'
  /** Hidden desktops stay paired but do not connect or appear in switchers. */
  hidden?: boolean
}

export interface PairingStore {
  pairings: StoredPairing[]
  activeId: string | null
}

interface LegacyPairing extends PairingConfig {
  deviceName?: string
}

const emptyStore = (): PairingStore => ({ pairings: [], activeId: null })
const defaultStorage = (): StorageLike => localStorage

/**
 * Called through `crypto` because browsers throw "Illegal invocation" for an
 * unbound randomUUID, and randomUUID is missing in insecure (http LAN) pages.
 * The id only has to be unique on this device, not unguessable.
 */
function defaultCreateId() {
  if (typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      /* fall through to getRandomValues */
    }
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function validPairing(value: unknown): value is StoredPairing {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.relayUrl === 'string' &&
    typeof item.connectCode === 'string' &&
    typeof item.addedAt === 'number' &&
    typeof item.lastActiveAt === 'number' &&
    (item.nameSource === undefined ||
      item.nameSource === 'auto' ||
      item.nameSource === 'user') &&
    (item.hidden === undefined || typeof item.hidden === 'boolean')
  )
}

function validLegacyPairing(value: unknown): value is LegacyPairing {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.relayUrl === 'string' && typeof item.connectCode === 'string'
  )
}

export function loadPairingStore(
  storage: StorageLike = defaultStorage(),
  now: () => number = Date.now,
  createId: () => string = defaultCreateId,
): PairingStore {
  try {
    const stored = storage.getItem(PAIRINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<PairingStore>
      const { pairings, aliases } = dedupePairings(
        Array.isArray(parsed.pairings)
          ? parsed.pairings.filter(validPairing)
          : [],
      )
      const requested =
        typeof parsed.activeId === 'string'
          ? (aliases.get(parsed.activeId) ?? parsed.activeId)
          : null
      const activeId = pairings.some(
        (item) => item.id === requested && item.hidden !== true,
      )
        ? requested
        : (pairings.find((item) => item.hidden !== true)?.id ?? null)
      return { pairings, activeId }
    }
  } catch {
    return emptyStore()
  }

  const legacyValue = storage.getItem(LEGACY_PAIRING_KEY)
  if (!legacyValue) return emptyStore()
  try {
    const legacy = JSON.parse(legacyValue) as unknown
    if (!validLegacyPairing(legacy)) return emptyStore()
    const timestamp = now()
    const pairing: StoredPairing = {
      id: createId(),
      name: legacy.deviceName || 'Alma Desktop',
      relayUrl: legacy.relayUrl,
      connectCode: legacy.connectCode,
      addedAt: timestamp,
      lastActiveAt: timestamp,
    }
    const migrated = { pairings: [pairing], activeId: pairing.id }
    try {
      storage.setItem(PAIRINGS_KEY, JSON.stringify(migrated))
      storage.removeItem(LEGACY_PAIRING_KEY)
    } catch {
      // Keep v1 so the next launch retries; this session still stays paired.
    }
    return migrated
  } catch {
    return emptyStore()
  }
}

export function savePairingStore(
  store: PairingStore,
  storage: StorageLike = defaultStorage(),
) {
  storage.setItem(PAIRINGS_KEY, JSON.stringify(store))
}

const samePairing = (a: StoredPairing, b: StoredPairing) =>
  a.id === b.id || a.connectCode === b.connectCode

/**
 * Applies `incoming` onto `existing`, keeping the existing identity, the
 * earliest addedAt and a locally chosen name over an automatic one.
 */
function mergePairing(
  existing: StoredPairing,
  incoming: StoredPairing,
): StoredPairing {
  const keepName =
    existing.nameSource === 'user' && incoming.nameSource !== 'user'
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    addedAt: Math.min(existing.addedAt, incoming.addedAt),
    hidden: existing.hidden,
    ...(keepName ? { name: existing.name, nameSource: 'user' as const } : {}),
  }
}

/** Duplicates in storage merge by recency but keep the first entry's id. */
function mergeDuplicate(kept: StoredPairing, duplicate: StoredPairing) {
  const [older, newer] =
    duplicate.lastActiveAt >= kept.lastActiveAt
      ? [kept, duplicate]
      : [duplicate, kept]
  return { ...mergePairing(older, newer), id: kept.id }
}

/**
 * Collapses entries sharing an id or connect code (including chains where one
 * entry bridges two others). `aliases` maps merged-away ids to survivors.
 */
function dedupePairings(items: StoredPairing[]) {
  const pairings: StoredPairing[] = []
  const aliases = new Map<string, string>()
  for (const item of items) {
    const matches = pairings.filter((kept) => samePairing(kept, item))
    if (!matches.length) {
      pairings.push(item)
      continue
    }
    const [first, ...rest] = matches
    let merged = first
    for (const other of rest) {
      merged = mergeDuplicate(merged, other)
      aliases.set(other.id, first.id)
      pairings.splice(pairings.indexOf(other), 1)
    }
    merged = mergeDuplicate(merged, item)
    if (item.id !== first.id) aliases.set(item.id, first.id)
    pairings[pairings.indexOf(first)] = merged
  }
  return { pairings, aliases }
}

export function upsertPairing(
  store: PairingStore,
  incoming: StoredPairing,
): PairingStore {
  const matches = store.pairings.filter((item) => samePairing(item, incoming))
  if (!matches.length) {
    return {
      pairings: [...store.pairings, incoming],
      activeId: incoming.id,
    }
  }
  // Fresh pairing data always wins, unlike recency-based storage dedupe.
  const [first, ...rest] = matches
  const updated = mergePairing(rest.reduce(mergeDuplicate, first), incoming)
  const pairings = store.pairings
    .filter((item) => !rest.includes(item))
    .map((item) => (item === first ? updated : item))
  return { pairings, activeId: updated.id }
}

/**
 * The relay routing id is a one-way HKDF of the connect code, so it is stable
 * per desktop pairing without persisting anything secret-derived beyond what
 * already appears in relay URLs.
 */
export async function createStoredPairing(
  config: PairingConfig,
  name: string,
  now: number = Date.now(),
): Promise<StoredPairing> {
  return {
    id: await routingId(config.connectCode),
    name: name.trim() || 'Alma Desktop',
    relayUrl: config.relayUrl,
    connectCode: config.connectCode,
    addedAt: now,
    lastActiveAt: now,
    nameSource: 'auto',
  }
}

export function renamePairing(
  store: PairingStore,
  id: string,
  name: string,
): PairingStore {
  const trimmed = name.trim()
  if (!trimmed) return store
  return {
    ...store,
    pairings: store.pairings.map((item) =>
      item.id === id ? { ...item, name: trimmed, nameSource: 'user' } : item,
    ),
  }
}

export function activatePairing(
  store: PairingStore,
  id: string,
  now: number = Date.now(),
): PairingStore {
  if (!store.pairings.some((item) => item.id === id)) return store
  return {
    activeId: id,
    pairings: store.pairings.map((item) =>
      item.id === id ? { ...item, lastActiveAt: now } : item,
    ),
  }
}

export function removePairing(store: PairingStore, id: string): PairingStore {
  const pairings = store.pairings.filter((item) => item.id !== id)
  return {
    pairings,
    activeId:
      store.activeId === id ? (pairings[0]?.id ?? null) : store.activeId,
  }
}

// Errors are shown verbatim on the pair screen, so they are user copy.
export function parsePairingLink(input: string): PairingConfig {
  const trimmed = input.trim()
  if (!trimmed.startsWith('alma://connect?'))
    throw new Error(t('connection.pair.linkRequired'))
  const url = new URL(trimmed)
  const relayUrl = url.searchParams.get('u')
  const connectCode = url.searchParams.get('k')
  if (!relayUrl || !connectCode || url.searchParams.get('e2e') !== '1')
    throw new Error(t('connection.pair.linkInvalid'))
  const parsedRelay = new URL(relayUrl)
  if (!['https:', 'http:'].includes(parsedRelay.protocol))
    throw new Error(t('connection.pair.relayUrlUnsupported'))
  if (!/^[A-Za-z0-9_-]{20,}$/.test(connectCode))
    throw new Error(t('connection.pair.codeInvalid'))
  return { relayUrl: parsedRelay.origin, connectCode }
}
