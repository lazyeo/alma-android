import { useEffect, useMemo, useRef } from 'react'
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
import { AlmaShell } from './AlmaShell'
import { useAlmaDeferHeavy } from './almaExpand'
import { useAlmaHandoff } from './almaHandoff'

// React 18 has no typed `inert`; the empty string sets the attribute.
const inert = (on: boolean) =>
  on ? ({ inert: '' } as Record<string, string>) : {}

/** `/d/:desktopId/alma`: the personal agent's main thread as a messenger. */
export function AlmaScreen() {
  const t = useT()
  const { pairing } = useConnection()
  const presence = useAlmaPresence()
  const refresh = presence?.refresh
  // Arriving through the expand, the shell stands in until the motion and
  // entrance are over; nothing heavy may run on those frames.
  const deferred = useAlmaDeferHeavy()
  // Then the real thread mounts behind the shell and the shell fades off it
  // once it has rendered at her latest message (see almaHandoff.ts).
  const realLayer = useRef<HTMLDivElement>(null)
  const phase = useAlmaHandoff(deferred, realLayer)
  // Fresh vitals and counters on arrival; the shared poller keeps them
  // current (30 s, focus, and after each reply) while the screen is open.
  useEffect(() => {
    if (!deferred) void refresh?.()
  }, [refresh, deferred])
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
  const covered = phase === 'shell' || phase === 'mounting'
  // One grid cell holds both layers, so the shell and the thread share a
  // box; the thread keeps its tree when the shell leaves.
  return (
    <div className="alma-handoff" data-alma-handoff={phase}>
      <div
        ref={realLayer}
        className="alma-handoff-layer alma-handoff-real"
        aria-hidden={covered || undefined}
        {...inert(covered)}
      >
        {phase === 'shell' ? null : (
          <PersonaThreadScreen
            threadId={state.personal.threadId}
            persona={persona}
          />
        )}
      </div>
      {phase === 'real' ? null : (
        <div
          className="alma-handoff-layer alma-handoff-shell"
          aria-hidden={covered ? undefined : true}
          {...inert(!covered)}
        >
          <AlmaShell
            desktopId={pairing.id}
            threadId={state.personal.threadId}
            backPath={backPath}
          />
        </div>
      )}
    </div>
  )
}
