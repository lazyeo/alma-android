import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ALMA_ROUTE, desktopAlmaPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { AlmaFace } from './AlmaFace'
import { useAlmaPresence, type AlmaPresence } from './AlmaPresence'
import { recordExpandDisc } from './almaExpand'
import { recordAvatarBox } from './avatarFlight'
import { useMeasuredBox } from './measuredBox'

/** CSS size of her face: the phone tab, the split rail's top slot. */
export const NAV_FACE_SIZE = { tab: 60, rail: 40 } as const

/**
 * Her slot: shown while the desktop has a personal agent, held through a
 * desktop switch until the new desktop answers, faded before it goes.
 */
export function almaNavSlot(presence: AlmaPresence | null) {
  if (!presence?.desktopId) return 'hidden'
  return (
    presence.slot ?? (presence.state.status === 'ready' ? 'shown' : 'hidden')
  )
}

/** The centre slot exists while the desktop has (or may have) her. */
export function useAlmaNavVisible() {
  return almaNavSlot(useAlmaPresence()) !== 'hidden'
}

/**
 * Alma's face: centre of the phone tab bar, the split rail's top slot.
 * Opens her conversation; /alma sets it up first when the desktop has none.
 */
export function AlmaNavButton({ placement }: { placement: 'tab' | 'rail' }) {
  const t = useT()
  const presence = useAlmaPresence()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const avatarRef = useRef<HTMLSpanElement>(null)
  const discRef = useRef<HTMLSpanElement>(null)
  const here = ALMA_ROUTE.test(pathname)
  // The screen expands out of this disc and Back collapses into it, and
  // her avatar clone flies from and to it, so keep both boxes current
  // whenever it is shown outside /alma (on /alma the header owns her
  // avatar). Measured after layout, never in the tap.
  // Both come from her face's own box, not the rail's item box around it,
  // so the circle starts at her face and its radius follows the face size.
  const slot = almaNavSlot(presence)
  const ready = presence?.state.status === 'ready'
  const visible = slot === 'shown'
  useMeasuredBox(discRef, visible && !here, () => {
    if (!avatarRef.current) return
    const face = avatarRef.current.getBoundingClientRect()
    recordExpandDisc(face)
    recordAvatarBox('nav', face)
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
  if (!presence?.desktopId || slot === 'hidden') return null
  const { desktopId, face, generating } = presence
  // While a newly chosen desktop loads, the slot keeps its place with a
  // resting face; it opens once the desktop answers.
  const { running, pendingApprovals } =
    presence.state.status === 'ready'
      ? presence.state.personal
      : { running: 0, pendingApprovals: 0 }
  const busy = ready && (generating || running > 0)
  return (
    <button
      type="button"
      className={`alma-nav alma-nav-${placement}${here ? ' active' : ''}`}
      aria-label={t('threads.personal.open')}
      aria-current={here ? 'page' : undefined}
      aria-disabled={ready ? undefined : 'true'}
      data-busy={busy ? 'true' : undefined}
      data-slot={slot === 'hiding' ? 'hiding' : undefined}
      onPointerDown={() => {
        if (!ready) return
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
        if (!ready) return
        if (event.detail === 0) void haptic('light')
        if (!here) navigate(desktopAlmaPath(desktopId))
      }}
    >
      <span ref={discRef} className="alma-nav-avatar">
        <span
          ref={avatarRef}
          // Hidden while her clone flies; on /alma the header is that end.
          className={here ? 'alma-avatar' : 'alma-avatar alma-avatar-flight'}
          data-alma-avatar={here ? undefined : 'nav'}
        >
          <AlmaFace
            size={NAV_FACE_SIZE[placement]}
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
      {/* Busy is a small dot centred under her face, never an outline: the
          drawn face is not centred in its box, so a ring looks lopsided. */}
      {busy ? (
        <span
          className="alma-nav-busy"
          role="img"
          aria-label={t('threads.personal.busy')}
        />
      ) : null}
    </button>
  )
}
