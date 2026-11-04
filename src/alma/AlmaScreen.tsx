import { useEffect, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useConnection } from '../desktops/DesktopContext'
import { desktopThreadsPath } from '../desktopRoutes'
import { useT } from '../i18n'
import {
  PersonaThreadScreen,
  type PersonaChrome,
} from '../screens/ThreadScreen'
import { AlmaHeader } from './AlmaHeader'
import { useAlmaPresence } from './AlmaPresence'

/** `/d/:desktopId/alma`: the personal agent's main thread as a messenger. */
export function AlmaScreen() {
  const t = useT()
  const { pairing } = useConnection()
  const presence = useAlmaPresence()
  const refresh = presence?.refresh
  // Fresh vitals and counters on arrival; the shared poller keeps them
  // current (30 s, focus, and after each reply) while the screen is open.
  useEffect(() => {
    void refresh?.()
  }, [refresh])
  const backPath = desktopThreadsPath(pairing.id)
  const persona = useMemo<PersonaChrome>(
    () => ({
      backPath,
      renderHeader: (props) => <AlmaHeader {...props} />,
    }),
    [backPath],
  )
  const state = presence?.state
  if (!state || state.status === 'loading')
    return <p className="empty">{t('thread.opening')}</p>
  // Unsupported, failed, or switched off on the desktop: nothing to show.
  if (state.status !== 'ready' || !state.personal.threadId)
    return <Navigate to={backPath} replace />
  return (
    <PersonaThreadScreen threadId={state.personal.threadId} persona={persona} />
  )
}
