import { useContext } from 'react'
import { ConnectionContext, useDesktops } from './DesktopContext'
import { DesktopSwitcher } from './DesktopSwitcher'
import { visiblePairings } from './desktopVisibility'

/**
 * The phone root-page heading as the desktop switcher. Uses the page's own
 * connection when there is one, else the active desktop's; falls back to the
 * plain title while no desktop is connected.
 */
export function DesktopTitleSwitcher({ fallback }: { fallback: string }) {
  const scoped = useContext(ConnectionContext)
  const { store, desktops } = useDesktops()
  const activeId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const connection =
    scoped ?? desktops.find((item) => item.pairing.id === activeId)?.connection
  if (!connection) return <>{fallback}</>
  return (
    <ConnectionContext.Provider value={connection}>
      <DesktopSwitcher className="desktop-title-switcher" variant="title" />
    </ConnectionContext.Provider>
  )
}
