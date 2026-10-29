import {
  Check,
  ChevronDown,
  LoaderCircle,
  Monitor,
  Plus,
  WifiOff,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnchoredMenu } from '../components/AnchoredMenu'
import type { MenuRect } from '../components/anchoredMenuPlacement'
import { desktopSectionPath } from '../desktopRoutes'
import type { DesktopStatus } from '../relay'
import { useConnection, useDesktops } from './DesktopContext'
import { useDesktopSwipe } from './useDesktopSwipe'
import { isDesktopHidden } from './desktopVisibility'
import { useT, type MessageKey } from '../i18n'

// Keys, not text: labels are translated at render time.
const STATUS_LABELS = {
  online: 'connection.status.online',
  connecting: 'connection.status.connecting',
  offline: 'connection.status.offline',
  error: 'connection.status.error',
} as const satisfies Record<DesktopStatus, MessageKey>

/**
 * Lists paired desktops in an anchored switcher. Thread ids are desktop-specific,
 * so switching always opens the selected desktop's thread list.
 */
export function DesktopSwitcher({ className = '' }: { className?: string }) {
  const t = useT()
  const { pairing, status } = useConnection()
  const { desktops } = useDesktops()
  const visibleDesktops = desktops.filter(
    ({ pairing: candidate }) => !isDesktopHidden(candidate),
  )
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<MenuRect>()
  const contentRef = useRef<HTMLSpanElement>(null)
  const pathForDesktop = (desktopId: string) =>
    desktopSectionPath(desktopId, pathname)
  const swipe = useDesktopSwipe(
    visibleDesktops,
    pairing.id,
    pathForDesktop,
    pathname,
  )
  // The bottom strip is a full-width button with centred content; anchoring
  // to the button would pin the menu to the screen edge, so anchor to what
  // is visible: the name plus the chevron after it.
  const openChange = (next: boolean) => {
    if (next) setAnchor(visibleContentRect(contentRef.current))
    setOpen(next)
  }
  return (
    <AnchoredMenu
      open={open}
      onOpenChange={openChange}
      anchorRect={anchor}
      label={t('connection.switcher.label')}
      trigger={
        <button
          className={`desktop-switcher${className ? ` ${className}` : ''}${swipe.className}`}
          aria-label={t('connection.switcher.trigger', { name: pairing.name })}
          aria-description={t('connection.switcher.hint')}
          style={swipe.style}
          {...swipe.handlers}
        >
          <span className="desktop-switcher-window" ref={contentRef}>
            <span className="desktop-switcher-slide desktop-switcher-current">
              <span
                className={`desktop-status-marker ${status}`}
                role="img"
                aria-label={t(STATUS_LABELS[status])}
              />
              <span className="desktop-switcher-name">{pairing.name}</span>
            </span>
            {swipe.neighbor ? (
              <span className="desktop-switcher-slide desktop-switcher-neighbor">
                <span
                  className={`desktop-status-marker ${swipe.neighbor.status}`}
                  role="img"
                  aria-label={t(STATUS_LABELS[swipe.neighbor.status])}
                />
                <span className="desktop-switcher-name">
                  {swipe.neighbor.pairing.name}
                </span>
              </span>
            ) : null}
          </span>
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      }
      items={[
        ...visibleDesktops.map((desktop) => {
          const current = desktop.pairing.id === pairing.id
          return {
            key: desktop.pairing.id,
            label: desktop.pairing.name,
            detail:
              desktop.status === 'online'
                ? undefined
                : t(STATUS_LABELS[desktop.status]),
            ariaLabel: t('connection.switcher.item', {
              name: desktop.pairing.name,
              status: t(STATUS_LABELS[desktop.status]),
            }),
            icon: <DesktopStatusIcon status={desktop.status} fallback />,
            checked: current,
            onSelect: () => {
              if (!current) {
                const path = pathForDesktop(desktop.pairing.id)
                navigate(path, { replace: true })
              }
            },
          }
        }),
        { type: 'separator' as const, key: 'add-separator' },
        {
          key: 'add-desktop',
          label: t('connection.switcher.add'),
          icon: <Plus size={16} />,
          onSelect: () => navigate('/settings'),
        },
      ]}
    />
  )
}

/** The name window joined with the chevron that follows it. */
export function visibleContentRect(
  content: Element | null,
): MenuRect | undefined {
  if (!content) return undefined
  const box = content.getBoundingClientRect()
  const chevron = content.nextElementSibling?.getBoundingClientRect()
  return {
    left: box.left,
    right: chevron ? Math.max(box.right, chevron.right) : box.right,
    top: box.top,
    bottom: box.bottom,
  }
}

export function DesktopStatusIcon({
  status,
  fallback = false,
}: {
  status: DesktopStatus
  fallback?: boolean
}) {
  const t = useT()
  return status === 'online' ? (
    fallback ? (
      <Monitor
        className="desktop-status online"
        size={12}
        aria-label={t('connection.status.online')}
      />
    ) : null
  ) : status === 'connecting' ? (
    <LoaderCircle
      className="spinner desktop-status"
      size={12}
      aria-label={t('connection.status.connecting')}
    />
  ) : (
    <WifiOff
      className="desktop-status"
      size={12}
      aria-label={t('connection.status.offline')}
    />
  )
}

// Kept as a compatibility alias for callers upgraded with this UI batch.
export const DesktopChooserSheet = DesktopSwitcher
