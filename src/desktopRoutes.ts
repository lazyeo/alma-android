export function desktopThreadsPath(desktopId: string) {
  return `/d/${encodeURIComponent(desktopId)}/threads`
}

export function desktopThreadPath(desktopId: string, threadId: string) {
  return `${desktopThreadsPath(desktopId)}/${encodeURIComponent(threadId)}`
}

/** GTD keeps its own list beside an opened conversation, like Threads. */
export function desktopGtdPath(desktopId: string, threadId?: string) {
  const base = `/d/${encodeURIComponent(desktopId)}/gtd`
  return threadId ? `${base}/${encodeURIComponent(threadId)}` : base
}

export function desktopScreenPath(desktopId: string) {
  return `/d/${encodeURIComponent(desktopId)}/screen`
}

export function desktopTimeCluesPath(desktopId: string) {
  return `/d/${encodeURIComponent(desktopId)}/time-clues`
}

export function desktopAgentsPath(desktopId: string) {
  return `/d/${encodeURIComponent(desktopId)}/agents`
}

export function desktopAgentPanePath(desktopId: string, paneId: string) {
  return `${desktopAgentsPath(desktopId)}/${encodeURIComponent(paneId)}`
}

export function desktopReferencesPath(desktopId: string, uri?: string) {
  const base = `/d/${encodeURIComponent(desktopId)}/references`
  return uri ? `${base}/${encodeURIComponent(uri)}` : base
}

/** Alma's main conversation (the personal agent) on one desktop. */
export function desktopAlmaPath(desktopId: string) {
  return `/d/${encodeURIComponent(desktopId)}/alma`
}

export const ALMA_ROUTE = /^\/d\/[^/]+\/alma\/?$/

/** Keep root desktop sections stable when the desktop switcher changes scope. */
export function desktopSectionPath(desktopId: string, pathname: string) {
  const section =
    /^\/d\/[^/]+\/(gtd|crystals|time-clues|references|agents)(?:\/|$)/.exec(
      pathname,
    )?.[1]
  if (section === 'gtd') return desktopGtdPath(desktopId)
  if (section === 'crystals') return desktopCrystalsPath(desktopId)
  if (section === 'time-clues') return desktopTimeCluesPath(desktopId)
  if (section === 'references') return desktopReferencesPath(desktopId)
  if (section === 'agents') return desktopAgentsPath(desktopId)
  return desktopThreadsPath(desktopId)
}

/** Crystals for one desktop; ids are desktop-specific. */
export function desktopCrystalsPath(desktopId: string, crystalId?: string) {
  const base = `/d/${encodeURIComponent(desktopId)}/crystals`
  return crystalId ? `${base}/${encodeURIComponent(crystalId)}` : base
}

/**
 * Phone tab roots where Android back exits instead of popping history.
 * GTD and Settings open from the Threads header, so Back returns there.
 */
export function isRootPath(pathname: string) {
  return (
    ['/', '/threads'].includes(pathname) ||
    /^\/d\/[^/]+\/(?:threads|agents)\/?$/.test(pathname)
  )
}
