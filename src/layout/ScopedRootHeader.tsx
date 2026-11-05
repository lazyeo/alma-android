import { ArrowLeft } from 'lucide-react'
import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLayoutMode } from './useLayoutMode'
import { useT } from '../i18n'
import { parentRoute } from '../navigation/parentRoute'
import { DesktopTitleSwitcher } from '../desktops/DesktopTitleSwitcher'

/**
 * Header for desktop-scoped roots. Phone child pages use history Back and a
 * local title. On phone root pages (`desktopTitle`) the title is the desktop
 * switcher; the split sidebar keeps its strip below the list.
 */
export function ScopedRootHeader({
  title,
  childOnPhone = false,
  desktopTitle = false,
  actions,
  className = '',
  children,
}: {
  title: ReactNode
  childOnPhone?: boolean
  desktopTitle?: boolean
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const t = useT()
  const mode = useLayoutMode()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const child = childOnPhone && mode === 'single'
  const switcherTitle = desktopTitle && mode === 'single'

  return (
    <header
      className={`page-header thread-list-header scoped-root-header${child ? ' scoped-child-header' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="thread-header-title scoped-root-title">
        {child ? (
          <button
            className="scoped-root-back"
            aria-label={t('common.back')}
            onClick={() => {
              const parent = parentRoute(pathname, mode)
              if (parent) navigate(parent, { replace: true })
              else navigate(-1)
            }}
          >
            <ArrowLeft size={20} />
          </button>
        ) : null}
        {switcherTitle && typeof title === 'string' ? (
          <h1 className="desktop-title">
            <DesktopTitleSwitcher fallback={title} />
          </h1>
        ) : (
          <h1>{title}</h1>
        )}
      </div>
      {children}
      {actions ? <div className="thread-header-actions">{actions}</div> : null}
    </header>
  )
}
