import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { ALMA_ROUTE, desktopAlmaPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { AlmaFace } from './AlmaFace'
import { useAlmaPresence } from './AlmaPresence'
import { recordExpandDisc } from './almaExpand'
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
  const discRef = useRef<HTMLSpanElement>(null)
  const here = ALMA_ROUTE.test(pathname)
  // On /alma (split rail) the header owns the shared avatar.
  useAvatarFlight(avatarRef, 'nav', !here)
  // The screen expands out of this disc and Back collapses into it, so keep
  // its box current whenever it is shown outside /alma.
  const visible = presence?.state.status === 'ready'
  useLayoutEffect(() => {
    if (visible && !here && discRef.current)
      recordExpandDisc(discRef.current.getBoundingClientRect())
  }, [visible, here, placement])
  const openable =
    presence?.state.status === 'ready' &&
    Boolean(presence.state.personal.threadId)
  // Load the screen chunk and warm her thread ahead of the tap: the expand
  // renders from the cache and must never wait on the network or Suspense.
  const fallbackTitle = t('threads.personal.title')
  const prefetch = () => {
    if (!here) presence?.prefetchThread?.(fallbackTitle)
  }
  const prefetchRef = useRef(prefetch)
  prefetchRef.current = prefetch
  useEffect(() => {
    if (!openable) return
    void import('./AlmaScreen')
    const idle = (
      window as {
        requestIdleCallback?: (callback: () => void) => number
        cancelIdleCallback?: (handle: number) => void
      }
    ).requestIdleCallback
    if (typeof idle !== 'function') {
      const timer = window.setTimeout(() => prefetchRef.current(), 1000)
      return () => window.clearTimeout(timer)
    }
    const handle = idle(() => prefetchRef.current())
    return () =>
      (
        window as { cancelIdleCallback?: (handle: number) => void }
      ).cancelIdleCallback?.(handle)
  }, [openable])
  const release = () => {
    if (discRef.current) delete discRef.current.dataset.pressed
  }
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
        onPointerDown={() => {
          // Press feedback and the warm-up start before the click lands.
          if (discRef.current) discRef.current.dataset.pressed = 'true'
          void haptic('light')
          prefetch()
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onClick={(event) => {
          // Keyboard activation has no pointer-down tick.
          if (event.detail === 0) void haptic('light')
          if (!threadId) setSetupOpen(true)
          else if (!here) {
            if (discRef.current)
              recordExpandDisc(discRef.current.getBoundingClientRect())
            navigate(desktopAlmaPath(desktopId))
          }
        }}
      >
        <span ref={discRef} className="alma-nav-avatar">
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
