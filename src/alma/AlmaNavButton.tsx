import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { ALMA_ROUTE, desktopAlmaPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { AlmaFace } from './AlmaFace'
import { useAlmaPresence } from './AlmaPresence'
import { recordExpandDisc } from './almaExpand'
import { recordAvatarBox } from './avatarFlight'
import { useMeasuredBox } from './measuredBox'

/** The centre slot exists only while the desktop has a personal agent. */
export function useAlmaNavVisible() {
  const presence = useAlmaPresence()
  return Boolean(presence?.desktopId && presence.state.status === 'ready')
}

/**
 * Alma's face: centre of the phone tab bar, top of the split rail.
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
  // The screen expands out of this disc and Back collapses into it, and
  // her avatar clone flies from and to it, so keep both boxes current
  // whenever it is shown outside /alma (on /alma the header owns her
  // avatar). Measured after layout, never in the tap.
  const visible = presence?.state.status === 'ready'
  useMeasuredBox(discRef, visible && !here, (disc) => {
    recordExpandDisc(disc.getBoundingClientRect())
    if (avatarRef.current)
      recordAvatarBox('nav', avatarRef.current.getBoundingClientRect())
  })
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
          // Press feedback only. No network here: a relay fetch on press
          // (base64 decode + decrypt + GC) landed inside the expand's first
          // frames on a real phone. The idle prefetch keeps the cache warm and
          // the shell is happy with stale rows.
          if (discRef.current) discRef.current.dataset.pressed = 'true'
          void haptic('light')
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onClick={(event) => {
          // Keyboard activation has no pointer-down tick.
          if (event.detail === 0) void haptic('light')
          if (!threadId) setSetupOpen(true)
          else if (!here) navigate(desktopAlmaPath(desktopId))
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
            // Hidden while her clone flies; on /alma the header is that end.
            className={here ? 'alma-avatar' : 'alma-avatar alma-avatar-flight'}
            data-alma-avatar={here ? undefined : 'nav'}
          >
            <AlmaFace
              size={placement === 'tab' ? 44 : 36}
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
