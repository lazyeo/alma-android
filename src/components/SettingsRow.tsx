import type { ReactNode } from 'react'

// The one settings list row. See docs/design-language.md (Settings anatomy).
export function SettingsRow({
  icon,
  title,
  secondary,
  ariaLabel,
  trailing,
  onClick,
  danger,
}: {
  icon: ReactNode
  title: string
  secondary?: string
  ariaLabel?: string
  trailing?: ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  const content = (
    <>
      <span className={`settings-icon${danger ? ' settings-icon-danger' : ''}`}>
        {icon}
      </span>
      <span className="settings-copy">
        <strong className={danger ? 'danger-text' : undefined}>{title}</strong>
        {secondary ? <small>{secondary}</small> : null}
      </span>
      {trailing}
    </>
  )
  return onClick ? (
    <button
      className="settings-row settings-row-button"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className="settings-row">{content}</div>
  )
}
