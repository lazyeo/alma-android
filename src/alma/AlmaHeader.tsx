import { ArrowLeft, Folder, MoreVertical } from 'lucide-react'
import { useRef, useState } from 'react'
import { AnchoredMenu } from '../components/AnchoredMenu'
import { useT } from '../i18n'
import { useLayoutMode } from '../layout/useLayoutMode'
import { AlmaFace } from './AlmaFace'
import { presenceFace, useAlmaPresence } from './AlmaPresence'
import { almaStatusLine } from './almaStatus'
import { recordAvatarBox } from './avatarFlight'
import { useMeasuredBox } from './measuredBox'

/**
 * Alma's own header: her face at top-left (the landing spot of the avatar
 * flight), her name, and one status line when there is something to say.
 * `generating` comes from the open thread, which knows a reply started
 * before the shared activity feed does. On split layouts her face is the
 * split shell's dock across the rail edge instead (`AlmaDock`), so the
 * header leaves room for it and draws none of its own. The trailing menu
 * carries the thread's files entry, as a normal thread's header menu does.
 */
export function AlmaHeader({
  generating,
  onBack,
  files,
}: {
  generating: boolean
  onBack?: () => void
  /** Omitted by the stand-in shell, which has no thread to list yet. */
  files?: { count: number; onOpen: () => void }
}) {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const presence = useAlmaPresence()
  const docked = useLayoutMode() === 'split'
  const avatarRef = useRef<HTMLSpanElement>(null)
  // Where her avatar clone lands on the next expand and leaves from on Back.
  useMeasuredBox(avatarRef, !docked, (avatar) =>
    recordAvatarBox('header', avatar.getBoundingClientRect()),
  )
  const state = presence?.state ?? { status: 'loading' as const }
  const live = generating || Boolean(presence?.generating)
  const face = presenceFace(state, live)
  const status =
    state.status === 'ready'
      ? almaStatusLine(
          { generating: live, personal: state.personal, vitals: state.vitals },
          t,
        )
      : undefined
  return (
    <header className={`detail-header alma-header${docked ? ' docked' : ''}`}>
      {onBack ? (
        <button aria-label={t('thread.back')} onClick={onBack}>
          <ArrowLeft />
        </button>
      ) : null}
      {docked ? null : (
        <span
          ref={avatarRef}
          className="alma-avatar alma-avatar-flight"
          data-alma-avatar="header"
        >
          <AlmaFace size={36} mood={face.mood} activity={face.activity} />
        </span>
      )}
      <div className="alma-heading">
        <h1>{t('threads.personal.title')}</h1>
        {status ? (
          <p className={`alma-status ${status.kind}`} aria-live="polite">
            {status.text}
          </p>
        ) : null}
      </div>
      {files ? (
        <div className="detail-actions">
          <AnchoredMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            label={t('thread.menu.label')}
            trigger={
              <button
                className="header-action-button"
                aria-label={t('thread.menu.label')}
              >
                <MoreVertical size={18} strokeWidth={2} />
              </button>
            }
            items={[
              {
                key: 'files',
                label: files.count
                  ? t('thread.menu.filesCount', { count: files.count })
                  : t('thread.menu.files'),
                icon: <Folder size={16} />,
                onSelect: files.onOpen,
              },
            ]}
          />
        </div>
      ) : null}
    </header>
  )
}
