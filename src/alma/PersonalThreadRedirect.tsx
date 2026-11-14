import type { ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { desktopAlmaPath } from '../desktopRoutes'
import { usePersonalThreadIds } from './personalThread'

/**
 * Her main conversation opens as Alma, not as a plain thread: a deep link,
 * notification or old bookmark to `/d/:desktopId/threads/:id` (or GTD's)
 * for her thread lands on `/d/:desktopId/alma` instead. Router state is
 * carried along: a share or new-chat hand-off (`pendingFirstSend`) lives
 * there, and the Alma screen's thread view sends it.
 */
export function PersonalThreadRedirect({ children }: { children: ReactNode }) {
  const { desktopId = '', threadId = '' } = useParams()
  const { state } = useLocation()
  const ids = usePersonalThreadIds(desktopId)
  if (threadId && ids.includes(threadId))
    return <Navigate to={desktopAlmaPath(desktopId)} replace state={state} />
  return <>{children}</>
}
