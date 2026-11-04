import { AppWindowMac, Check, Monitor } from 'lucide-react'
import type { ReactNode } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { useT } from '../../i18n'
import type { ScreenStatus } from './protocol'
import {
  currentSelection,
  pickerDisplays,
  pickerWindows,
  sameSelection,
  windowAppName,
  type PickerSelection,
} from './screenTargets'
import type { ScreenWindowList } from './useRemoteScreen'

export function ScreenPicker({
  status,
  windowList,
  onSelect,
  onClose,
}: {
  status?: ScreenStatus
  /** Undefined while the desktop is still listing its windows. */
  windowList?: ScreenWindowList
  onSelect: (selection: PickerSelection) => void
  onClose: () => void
}) {
  const t = useT()
  const current = currentSelection(status)
  const displays = pickerDisplays(status)
  const windows = windowList ? pickerWindows(windowList.windows) : []
  const row = (
    selection: PickerSelection,
    icon: ReactNode,
    title: string,
    secondary?: string,
  ) => {
    const selected = sameSelection(selection, current)
    return (
      <button
        key={`${selection.kind}-${selection.id}`}
        className={`sheet-row${selected ? ' selected' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(selection)}
      >
        <span className="remote-picker-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="sheet-row-copy">
          <span>{title}</span>
          {secondary ? <small>{secondary}</small> : null}
        </span>
        {selected ? <Check className="sheet-row-check" size={18} /> : null}
      </button>
    )
  }

  return (
    <BottomSheet
      title={t('screen.picker.title')}
      className="remote-screen-picker"
      onClose={onClose}
    >
      <section
        className="sheet-section"
        aria-labelledby="screen-picker-displays"
      >
        <h3 id="screen-picker-displays">
          {displays.length
            ? t('screen.picker.displays')
            : t('screen.picker.screen')}
        </h3>
        <div className="sheet-list">
          {displays.length
            ? displays.map((display) =>
                row(
                  { kind: 'display', id: display.id },
                  <Monitor size={16} />,
                  display.name || t('screen.picker.display'),
                  display.primary ? t('screen.picker.primary') : undefined,
                ),
              )
            : row(
                { kind: 'display', id: status?.displayId ?? 0 },
                <Monitor size={16} />,
                t('screen.picker.wholeScreen'),
              )}
        </div>
      </section>
      {status?.windows ? (
        <section
          className="sheet-section"
          aria-labelledby="screen-picker-windows"
        >
          <h3 id="screen-picker-windows">{t('screen.picker.windows')}</h3>
          {!windowList ? (
            <p className="sheet-status" role="status">
              {t('screen.picker.loading')}
            </p>
          ) : windowList.error && !windows.length ? (
            <p className="sheet-error" role="alert">
              {t('screen.picker.failed')}
            </p>
          ) : !windows.length ? (
            <p className="sheet-status">{t('screen.picker.empty')}</p>
          ) : (
            <div className="sheet-list">
              {windows.map((window) =>
                row(
                  { kind: 'window', id: window.id },
                  window.icon ? (
                    <img src={window.icon} alt="" width={20} height={20} />
                  ) : (
                    <AppWindowMac size={16} />
                  ),
                  windowAppName(window) || window.title || '',
                  windowAppName(window) ? window.title : undefined,
                ),
              )}
            </div>
          )}
        </section>
      ) : null}
    </BottomSheet>
  )
}
