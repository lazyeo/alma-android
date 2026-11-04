import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { ALMA_ROUTE, desktopAlmaPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { AlmaFace } from './AlmaFace'
import { useAlmaPresence } from './AlmaPresence'
import { useAvatarFlight } from './avatarFlight'

/** The centre slot exists only while the desktop has a personal agent. */
export function useAlmaNavVisible() {
  const presence = useAlmaPresence()
  return Boolean(presence?.desktopId && presence.state.status === 'ready')
}

/**
 * Alma's raised avatar: centre of the phone tab bar, top of the split rail.
 * Opens her conversation, or explains how to turn her on.
 */
export function AlmaNavButton({ placement }: { placement: 'tab' | 'rail' }) {
  const t = useT()
  const presence = useAlmaPresence()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [setupOpen, setSetupOpen] = useState(false)
  const avatarRef = useRef<HTMLSpanElement>(null)
  const here = ALMA_ROUTE.test(pathname)
  // On /alma (split rail) the header owns the shared avatar.
  useAvatarFlight(avatarRef, 'nav', !here)
  const openable =
    presence?.state.status === 'ready' &&
    Boolean(presence.state.personal.threadId)
  // Load the screen chunk ahead of the tap: a Suspense fallback in the
  // transition's new snapshot would leave the avatar nowhere to land.
  useEffect(() => {
    if (openable) void import('./AlmaScreen')
  }, [openable])
  if (!presence?.desktopId || presence.state.status !== 'ready') return null
  const { desktopId, face, generating } = presence
  const { threadId, running, pendingApprovals } = presence.state.personal
  const busy = generating || running > 0
  return (
    <>
      <button
        type="button"
        className={`alma-nav alma-nav-${placement}${here ? ' active' : ''}`}
        aria-label={t('threads.personal.open')}
        aria-current={here ? 'page' : undefined}
        data-busy={busy ? 'true' : undefined}
        onClick={() => {
          void haptic('light')
          if (!threadId) setSetupOpen(true)
          else if (!here) navigate(desktopAlmaPath(desktopId))
        }}
      >
        <span className="alma-nav-avatar">
          {busy ? (
            <span
              className="alma-nav-ring"
              aria-label={t('threads.personal.busy')}
            />
          ) : null}
          <span
            ref={avatarRef}
            // Only one element may carry the shared view-transition name.
            className={here ? 'alma-avatar' : 'alma-avatar alma-avatar-flight'}
          >
            <AlmaFace
              size={placement === 'tab' ? 48 : 36}
              mood={face.mood}
              activity={face.activity}
            />
          </span>
          {pendingApprovals > 0 ? (
            <span
              className="alma-nav-badge"
              aria-label={t('threads.personal.needsYou')}
            />
          ) : null}
        </span>
      </button>
      {setupOpen ? (
        <BottomSheet
          title={t('threads.personal.setup.title')}
          className="alma-setup-sheet"
          onClose={() => setSetupOpen(false)}
          footer={
            <button className="primary" onClick={() => setSetupOpen(false)}>
              {t('threads.personal.setup.done')}
            </button>
          }
        >
          <p className="settings-section-note">
            {t('threads.personal.setup.body')}
          </p>
        </BottomSheet>
      ) : null}
    </>
  )
}
