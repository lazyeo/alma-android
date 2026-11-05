import { useRef } from 'react'
import { AlmaFace } from './AlmaFace'
import { useAlmaPresence } from './AlmaPresence'
import { almaNavSlot } from './AlmaNavButton'
import { DOCK_AVATAR_PX, recordAvatarBox } from './avatarFlight'
import { useMeasuredBox } from './measuredBox'

/**
 * Her one face on /alma in split layouts: docked across the rail's right
 * edge, centred on the header row, in place of both the rail slot face
 * and the header avatar. It is the `header` end of the avatar flight, so
 * the expand lands the rail face here and Back flies it home. The split
 * shell owns it, outside the panes that recede, rise and hand off, so
 * there is only ever one. Decorative like the header avatar was: the
 * header's status line already says busy or waiting on approvals.
 */
export function AlmaDock() {
  const presence = useAlmaPresence()
  const avatarRef = useRef<HTMLSpanElement>(null)
  useMeasuredBox(avatarRef, true, (avatar) =>
    recordAvatarBox('header', avatar.getBoundingClientRect()),
  )
  if (!presence?.desktopId || almaNavSlot(presence) === 'hidden') return null
  const { face, generating } = presence
  const ready = presence.state.status === 'ready'
  const { running, pendingApprovals } =
    presence.state.status === 'ready'
      ? presence.state.personal
      : { running: 0, pendingApprovals: 0 }
  const busy = ready && (generating || running > 0)
  return (
    <div className="alma-dock alma-avatar-flight" aria-hidden="true">
      <span ref={avatarRef} className="alma-avatar" data-alma-avatar="header">
        <AlmaFace
          size={DOCK_AVATAR_PX}
          mood={face.mood}
          activity={face.activity}
        />
      </span>
      {pendingApprovals > 0 ? <span className="alma-nav-badge" /> : null}
      {busy ? <span className="alma-nav-busy" /> : null}
    </div>
  )
}
