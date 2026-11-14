import { useEffect, useMemo, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
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
  const startSetup = presence?.startSetup
  const setup = presence?.setup ?? 'idle'
  // Presence follows the active desktop and only catches up after a switch
  // (a share into another desktop): until then it describes someone else's
  // Alma, so it counts as still loading here.
  const state =
    presence?.desktopId && presence.desktopId !== pairing.id
      ? undefined
      : presence?.state
  // A share or new-chat hand-off for her thread (PersonalThreadRedirect
  // forwards it); ThreadView sends it once her thread is open.
  const pendingShare = Boolean(
    (useLocation().state as { pendingFirstSend?: unknown } | null)
      ?.pendingFirstSend,
  )
  // The desktop cannot create her main conversation, so the phone finds or
  // makes one (personalSetup.ts); the shell stands in until it is known.
  const needsSetup = state?.status === 'ready' && !state.personal.threadId
  // Arriving through the expand, the shell stands in until the motion and
  // entrance are over; nothing heavy may run on those frames.
  const deferred = useAlmaDeferHeavy()
  // Then the real thread mounts behind the shell and the shell fades off it
  // once it has rendered at her latest message (see almaHandoff.ts).
  const realLayer = useRef<HTMLDivElement>(null)
  const phase = useAlmaHandoff(deferred || needsSetup, realLayer)
  // Fresh vitals and counters on arrival; the shared poller keeps them
  // current (30 s, focus, and after each reply) while the screen is open.
  useEffect(() => {
    if (!deferred) void refresh?.()
  }, [refresh, deferred])
  // After the expand, so its frames stay free of relay work.
  useEffect(() => {
    if (!deferred && needsSetup && setup === 'idle') startSetup?.()
  }, [deferred, needsSetup, setup, startSetup])
  const backPath = desktopThreadsPath(pairing.id)
  const persona = useMemo<PersonaChrome>(
    () => ({
      backPath,
      renderHeader: (props) => <AlmaHeader {...props} />,
    }),
    [backPath],
  )
  if (!state || state.status === 'loading')
    return <p className="empty">{t('thread.opening')}</p>
  // Leaving would drop a pending share without a word, so say it is unsent
  // and offer a retry; the hand-off stays in the location until it sends.
  if (state.status !== 'ready' && pendingShare)
    return (
      <div className="empty alma-setup-state" role="alert">
        <p>{t('threads.personal.shareUnsent')}</p>
        <button
          type="button"
          className="quiet-text-button"
          onClick={() => void refresh?.()}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  // Unsupported or unreachable: nothing to show.
  if (state.status !== 'ready') return <Navigate to={backPath} replace />
  const threadId = state.personal.threadId ?? undefined
  const notice = threadId ? undefined : setup === 'error' ? (
    <div className="empty alma-setup-state" role="alert">
      <p>{t('threads.personal.setup.failed')}</p>
      <button
        type="button"
        className="quiet-text-button"
        onClick={() => startSetup?.()}
      >
        {t('common.tryAgain')}
      </button>
    </div>
  ) : (
    <p className="empty alma-setup-state">{t('thread.opening')}</p>
  )
  // Without a thread the shell is all there is, whatever the phase (a deep
  // link starts at 'real').
  const covered = phase === 'shell' || phase === 'mounting' || !threadId
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
        {phase === 'shell' || !threadId ? null : (
          <PersonaThreadScreen threadId={threadId} persona={persona} />
        )}
      </div>
      {phase === 'real' && threadId ? null : (
        <div
          className="alma-handoff-layer alma-handoff-shell"
          aria-hidden={covered ? undefined : true}
          {...inert(!covered)}
        >
          <AlmaShell
            desktopId={pairing.id}
            threadId={threadId}
            backPath={backPath}
            notice={notice}
          />
        </div>
      )}
    </div>
  )
}
