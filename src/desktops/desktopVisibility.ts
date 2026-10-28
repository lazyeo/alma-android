import type { PairingStore, StoredPairing } from '../relay'

export const isDesktopHidden = (pairing: StoredPairing) =>
  pairing.hidden === true

export const visiblePairings = (pairings: StoredPairing[]) =>
  pairings.filter((pairing) => !isDesktopHidden(pairing))

export const hiddenPairings = (pairings: StoredPairing[]) =>
  pairings.filter(isDesktopHidden)

export function canHideDesktop(pairings: StoredPairing[], id: string) {
  const pairing = pairings.find((item) => item.id === id)
  return Boolean(
    pairing &&
    !isDesktopHidden(pairing) &&
    visiblePairings(pairings).length > 1,
  )
}

export function setDesktopHidden(
  store: PairingStore,
  id: string,
  hidden: boolean,
): PairingStore {
  const current = store.pairings.find((pairing) => pairing.id === id)
  if (!current || isDesktopHidden(current) === hidden) return store
  if (hidden && !canHideDesktop(store.pairings, id)) return store
  const pairings = store.pairings.map((pairing) =>
    pairing.id === id ? { ...pairing, hidden } : pairing,
  )
  return {
    pairings,
    activeId:
      hidden && store.activeId === id
        ? (visiblePairings(pairings)[0]?.id ?? null)
        : store.activeId,
  }
}
