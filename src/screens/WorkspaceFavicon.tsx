import { useEffect, useState } from 'react'
import type { AlmaApi } from '../relay'
import {
  getCachedWorkspaceFavicon,
  peekWorkspaceFavicon,
} from './workspaceFaviconCache'

/** The workspace's icon before its name in the project list; nothing without one. */
export function WorkspaceFavicon({
  api,
  workspaceId,
  round,
}: {
  api: Pick<AlmaApi, 'getWorkspaceFavicon'>
  workspaceId: string
  /** Changes on reconnect and pull-to-refresh so the icon is asked again. */
  round: string
}) {
  // Read the cache synchronously so a remounted list (tab switch) does not
  // flash the rows without their icons.
  const [icon, setIcon] = useState(
    () => peekWorkspaceFavicon(api, workspaceId) ?? null,
  )
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    let active = true
    setIcon(peekWorkspaceFavicon(api, workspaceId) ?? null)
    setBroken(false)
    void getCachedWorkspaceFavicon(api, workspaceId, round).then((dataUrl) => {
      if (active) setIcon(dataUrl)
    })
    return () => {
      active = false
    }
  }, [api, workspaceId, round])

  if (!icon || broken) return null
  return (
    <img
      className="project-row-favicon"
      src={icon}
      alt=""
      onError={() => setBroken(true)}
    />
  )
}
