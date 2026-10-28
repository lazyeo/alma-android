type OverlayEntry = { id: symbol; close(): void }

const overlays: OverlayEntry[] = []

export function registerOverlay(close: () => void) {
  const entry = { id: Symbol('overlay'), close }
  overlays.push(entry)
  return () => {
    const index = overlays.findIndex((candidate) => candidate.id === entry.id)
    if (index >= 0) overlays.splice(index, 1)
  }
}

export function closeTopOverlay() {
  const entry = overlays.at(-1)
  if (!entry) return false
  entry.close()
  return true
}

export function handleOverlayPopState(restoreHistory: () => void) {
  if (!closeTopOverlay()) return false
  restoreHistory()
  return true
}

export function overlayCount() {
  return overlays.length
}

export function resetOverlayStackForTests() {
  overlays.splice(0)
}
