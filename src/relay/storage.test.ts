import { afterEach, describe, expect, it, vi } from 'vitest'
import { routingId } from './crypto'
import {
  LEGACY_PAIRING_KEY,
  PAIRINGS_KEY,
  activatePairing,
  createStoredPairing,
  loadPairingStore,
  removePairing,
  renamePairing,
  upsertPairing,
  type PairingStore,
  type StorageLike,
} from './storage'

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

const legacy = {
  relayUrl: 'https://relay.example',
  connectCode: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
  deviceName: 'Alma Desktop',
}

describe('pairing storage v2 migration', () => {
  it('migrates a valid v1 pairing and removes v1 only after v2 is saved', () => {
    const storage = memoryStorage({
      [LEGACY_PAIRING_KEY]: JSON.stringify(legacy),
    })

    const store = loadPairingStore(
      storage,
      () => 1234,
      () => 'desktop-a',
    )

    expect(store).toEqual({
      activeId: 'desktop-a',
      pairings: [
        {
          id: 'desktop-a',
          name: 'Alma Desktop',
          relayUrl: legacy.relayUrl,
          connectCode: legacy.connectCode,
          addedAt: 1234,
          lastActiveAt: 1234,
        },
      ],
    })
    expect(storage.getItem(PAIRINGS_KEY)).toBe(JSON.stringify(store))
    expect(storage.getItem(LEGACY_PAIRING_KEY)).toBeNull()
  })

  it('returns an empty store when v1 is absent', () => {
    expect(loadPairingStore(memoryStorage())).toEqual({
      activeId: null,
      pairings: [],
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('migrates with the default id generator, which must stay bound to crypto', () => {
    // Browsers throw "Illegal invocation" when randomUUID is called unbound.
    vi.spyOn(crypto, 'randomUUID').mockImplementation(function (this: unknown) {
      if (this !== crypto) throw new TypeError('Illegal invocation')
      return '00000000-0000-4000-8000-000000000001'
    })
    const storage = memoryStorage({
      [LEGACY_PAIRING_KEY]: JSON.stringify(legacy),
    })

    const store = loadPairingStore(storage)

    expect(store.pairings).toHaveLength(1)
    expect(store.pairings[0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      connectCode: legacy.connectCode,
    })
    expect(store.activeId).toBe(store.pairings[0].id)
    expect(storage.getItem(LEGACY_PAIRING_KEY)).toBeNull()
  })

  it('migrates without randomUUID (insecure LAN dev contexts)', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function')
    })
    const storage = memoryStorage({
      [LEGACY_PAIRING_KEY]: JSON.stringify(legacy),
    })

    const store = loadPairingStore(storage)

    expect(store.pairings).toHaveLength(1)
    expect(store.pairings[0].id).toMatch(/\S{16,}/)
    expect(store.pairings[0].connectCode).toBe(legacy.connectCode)
  })

  it('keeps v1 and still returns the pairing when saving v2 fails', () => {
    const storage = memoryStorage({
      [LEGACY_PAIRING_KEY]: JSON.stringify(legacy),
    })
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    const store = loadPairingStore(
      storage,
      () => 1,
      () => 'desktop-a',
    )

    expect(store.activeId).toBe('desktop-a')
    expect(store.pairings[0].connectCode).toBe(legacy.connectCode)
    expect(storage.getItem(LEGACY_PAIRING_KEY)).toBe(JSON.stringify(legacy))
  })

  it('ignores corrupt v1 without deleting it', () => {
    const storage = memoryStorage({ [LEGACY_PAIRING_KEY]: '{broken' })
    expect(loadPairingStore(storage)).toEqual({
      activeId: null,
      pairings: [],
    })
    expect(storage.getItem(LEGACY_PAIRING_KEY)).toBe('{broken')
  })
})

describe('pairing dedupe', () => {
  it('updates an existing desktop by routing id or connect code', () => {
    const initial: PairingStore = {
      activeId: 'desktop-a',
      pairings: [
        {
          id: 'desktop-a',
          name: 'Old name',
          relayUrl: 'https://old.example',
          connectCode: legacy.connectCode,
          addedAt: 10,
          lastActiveAt: 20,
        },
      ],
    }

    const byCode = upsertPairing(initial, {
      id: 'new-derived-id',
      name: 'Health name',
      relayUrl: 'https://new.example',
      connectCode: legacy.connectCode,
      addedAt: 30,
      lastActiveAt: 30,
    })
    expect(byCode.pairings).toHaveLength(1)
    expect(byCode.pairings[0]).toMatchObject({
      id: 'desktop-a',
      name: 'Health name',
      relayUrl: 'https://new.example',
      addedAt: 10,
    })

    const byId = upsertPairing(byCode, {
      ...byCode.pairings[0],
      id: 'desktop-a',
      connectCode: 'ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210abcde',
      lastActiveAt: 40,
    })
    expect(byId.pairings).toHaveLength(1)
    expect(byId.pairings[0].connectCode).toContain('ZYX')
  })
})

describe('pairing v2 dedupe on load', () => {
  const item = (id: string, connectCode: string, lastActiveAt: number) => ({
    id,
    name: id,
    relayUrl: 'https://relay.example',
    connectCode,
    addedAt: lastActiveAt,
    lastActiveAt,
  })

  it('collapses duplicate ids and connect codes, keeping the newest data', () => {
    const codeA = `a${legacy.connectCode}`
    const codeB = `b${legacy.connectCode}`
    const storage = memoryStorage({
      [PAIRINGS_KEY]: JSON.stringify({
        activeId: 'a-dup-code',
        pairings: [
          item('a', codeA, 1),
          item('b', codeB, 2),
          { ...item('a', `${codeA}rotated`, 5), name: 'Newest A' },
          item('a-dup-code', `${codeA}rotated`, 3),
          item('b', codeB, 4),
        ],
      }),
    })

    const store = loadPairingStore(storage)

    expect(store.pairings).toHaveLength(2)
    expect(store.pairings.map((pairing) => pairing.id)).toEqual(['a', 'b'])
    expect(store.pairings[0]).toMatchObject({
      name: 'Newest A',
      connectCode: `${codeA}rotated`,
      addedAt: 1,
      lastActiveAt: 5,
    })
    expect(store.pairings[1]).toMatchObject({ addedAt: 2, lastActiveAt: 4 })
    // An active id that was merged away resolves to its surviving entry.
    expect(store.activeId).toBe('a')
  })

  it('merges an entry matching two desktops into the first one', () => {
    const codeA = `a${legacy.connectCode}`
    const codeB = `b${legacy.connectCode}`
    const storage = memoryStorage({
      [PAIRINGS_KEY]: JSON.stringify({
        activeId: 'b',
        pairings: [
          item('a', codeA, 1),
          item('b', codeB, 2),
          item('a', codeB, 3),
        ],
      }),
    })

    const store = loadPairingStore(storage)

    expect(store.pairings).toHaveLength(1)
    expect(store.pairings[0]).toMatchObject({ id: 'a', connectCode: codeB })
    expect(store.activeId).toBe('a')
  })

  it('upsert collapses every entry matching the incoming id or code', () => {
    const codeA = `a${legacy.connectCode}`
    const codeB = `b${legacy.connectCode}`
    const store: PairingStore = {
      activeId: 'b',
      pairings: [
        item('a', codeA, 1),
        item('b', codeB, 2),
        item('c', 'c'.repeat(30), 3),
      ],
    }

    const next = upsertPairing(store, item('a', codeB, 9))

    expect(next.pairings.map((pairing) => pairing.id)).toEqual(['a', 'c'])
    expect(next.pairings[0]).toMatchObject({ connectCode: codeB, addedAt: 1 })
    expect(next.activeId).toBe('a')
  })
})

describe('re-pair naming', () => {
  it('keeps a locally renamed desktop name when re-paired', async () => {
    const paired = await createStoredPairing(legacy, 'Health name', 1)
    const renamed = renamePairing(
      upsertPairing({ activeId: null, pairings: [] }, paired),
      paired.id,
      'My Mac',
    )

    const again = upsertPairing(
      renamed,
      await createStoredPairing(legacy, 'New health name', 2),
    )

    expect(again.pairings).toHaveLength(1)
    expect(again.pairings[0].name).toBe('My Mac')
    expect(again.pairings[0].lastActiveAt).toBe(2)
  })

  it('persists the rename marker through storage', async () => {
    const paired = await createStoredPairing(legacy, 'Health name', 1)
    const storage = memoryStorage({
      [PAIRINGS_KEY]: JSON.stringify(
        renamePairing(
          upsertPairing({ activeId: null, pairings: [] }, paired),
          paired.id,
          'My Mac',
        ),
      ),
    })

    const again = upsertPairing(
      loadPairingStore(storage),
      await createStoredPairing(legacy, 'New health name', 2),
    )

    expect(again.pairings[0].name).toBe('My Mac')
  })

  it('still updates default or health names that were never renamed', async () => {
    const first = upsertPairing(
      { activeId: null, pairings: [] },
      await createStoredPairing(legacy, '', 1),
    )
    expect(first.pairings[0].name).toBe('Alma Desktop')

    const again = upsertPairing(
      first,
      await createStoredPairing(legacy, 'Studio Mac', 2),
    )
    expect(again.pairings[0].name).toBe('Studio Mac')

    // Entries saved before the marker existed count as not renamed.
    const { nameSource: _, ...unmarked } = again.pairings[0]
    const legacyEntry = upsertPairing(
      { activeId: unmarked.id, pairings: [unmarked] },
      await createStoredPairing(legacy, 'Mac Pro', 3),
    )
    expect(legacyEntry.pairings[0].name).toBe('Mac Pro')
  })
})

describe('pairing hidden migration', () => {
  it('keeps old pairings visible and falls back from a hidden active desktop', () => {
    const storage = memoryStorage({
      [PAIRINGS_KEY]: JSON.stringify({
        activeId: 'hidden',
        pairings: [
          {
            id: 'hidden',
            name: 'Hidden',
            relayUrl: 'https://relay.example',
            connectCode: `hidden${legacy.connectCode}`,
            addedAt: 1,
            lastActiveAt: 1,
            hidden: true,
          },
          {
            id: 'old',
            name: 'Old format',
            relayUrl: 'https://relay.example',
            connectCode: `old${legacy.connectCode}`,
            addedAt: 1,
            lastActiveAt: 1,
          },
        ],
      }),
    })

    expect(loadPairingStore(storage)).toMatchObject({
      activeId: 'old',
      pairings: [{ id: 'hidden', hidden: true }, { id: 'old' }],
    })
  })
})

describe('pairing lifecycle', () => {
  const base: PairingStore = {
    activeId: 'a',
    pairings: ['a', 'b'].map((id) => ({
      id,
      name: id,
      relayUrl: 'https://relay.example',
      connectCode: `${id}${legacy.connectCode}`,
      addedAt: 1,
      lastActiveAt: 1,
    })),
  }

  it('derives a stable id from the routing id and never the raw code', async () => {
    const first = await createStoredPairing(legacy, ' Mac mini ', 5)
    const again = await createStoredPairing(legacy, 'Other', 9)
    expect(first.id).toBe(await routingId(legacy.connectCode))
    expect(first.id).toBe(again.id)
    expect(first.id).not.toContain(legacy.connectCode)
    expect(first).toMatchObject({ name: 'Mac mini', addedAt: 5 })
    expect((await createStoredPairing(legacy, '  ')).name).toBe('Alma Desktop')
  })

  it('upserts a re-scanned desktop instead of duplicating it', async () => {
    const pairing = await createStoredPairing(legacy, 'Home', 1)
    const once = upsertPairing(base, pairing)
    const twice = upsertPairing(once, { ...pairing, name: 'Home Mac' })
    expect(twice.pairings).toHaveLength(3)
    expect(twice.activeId).toBe(pairing.id)
    expect(twice.pairings[2].name).toBe('Home Mac')
  })

  it('renames, activates and removes without touching other desktops', () => {
    const renamed = renamePairing(base, 'b', ' Mini ')
    expect(renamed.pairings.map((item) => item.name)).toEqual(['a', 'Mini'])
    expect(renamePairing(base, 'b', '   ')).toBe(base)

    const active = activatePairing(renamed, 'b', 50)
    expect(active.activeId).toBe('b')
    expect(active.pairings[1].lastActiveAt).toBe(50)
    expect(active.pairings[0].lastActiveAt).toBe(1)
    expect(activatePairing(active, 'missing')).toBe(active)

    const removed = removePairing(active, 'b')
    expect(removed).toMatchObject({ activeId: 'a' })
    expect(removePairing(removed, 'a')).toEqual({
      activeId: null,
      pairings: [],
    })
  })
})
