import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import { haptic } from '../haptics'
import { shouldFinishOverlayClose } from '../overlayClosing'
import {
  anchoredMenuHasContent,
  narrowAnchorToContent,
  placeAnchoredMenu,
  type MenuRect,
} from './anchoredMenuPlacement'
import { useAnimatedOverlay } from './useAnimatedOverlay'
import { useLongPressLift } from './longPressLift'

export type AnchoredMenuItem =
  | { type: 'separator'; key?: string }
  | {
      type?: 'item'
      key: string
      label: string
      detail?: ReactNode
      ariaLabel?: string
      icon?: ReactNode
      checked?: boolean
      destructive?: boolean
      /** Picking it removes or moves the pressed row; destructive implies it. */
      removesAnchor?: boolean
      disabled?: boolean
      onSelect(): void
    }

function setRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value)
      else if (ref) (ref as { current: T }).current = value
    }
  }
}

export function pointAnchor(x: number, y: number): MenuRect {
  return { left: x, right: x, top: y, bottom: y }
}

/** Lifted copies grow by this much (scale and the -2px raise) past the row. */
const LIFT_CLEARANCE = 6

/**
 * With a lifted row on screen the menu sits above or below the row, never
 * on it; the horizontal anchor (the press point) is kept.
 */
export function anchorBesideLift(anchor: MenuRect, lift: MenuRect): MenuRect {
  return {
    left: anchor.left,
    right: anchor.right,
    top: lift.top - LIFT_CLEARANCE,
    bottom: lift.bottom + LIFT_CLEARANCE,
  }
}

export function AnchoredMenu({
  open,
  onOpenChange,
  trigger,
  items,
  anchorRect,
  label,
  header,
  immediateClose = false,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  trigger?: ReactElement
  items: AnchoredMenuItem[]
  anchorRect?: MenuRect
  label: string
  header?: ReactNode
  immediateClose?: boolean
}) {
  const menuId = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const { rendered, closing, requestClose, finishClose } = useAnimatedOverlay(
    open,
    () => onOpenChange(false),
  )
  // Declared before placement so the menu can anchor beside the lifted row.
  const lift = useLongPressLift(backdropRef, rendered, closing, { dim: true })

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const triggerBox = triggerRef.current?.getBoundingClientRect()
    const anchor =
      anchorRect ??
      (triggerBox
        ? narrowAnchorToContent(
            {
              left: triggerBox.left,
              right: triggerBox.right,
              top: triggerBox.top,
              bottom: triggerBox.bottom,
            },
            [...(triggerRef.current?.children ?? [])].map((child) =>
              child.getBoundingClientRect(),
            ),
          )
        : undefined)
    if (!anchor) return
    const lifted = lift.current?.rect
    const menuBox = menuRef.current.getBoundingClientRect()
    const placement = placeAnchoredMenu(
      lifted ? anchorBesideLift(anchor, lifted) : anchor,
      { width: menuBox.width, height: menuBox.height },
      { width: window.innerWidth, height: window.innerHeight },
    )
    setStyle({
      left: placement.left,
      top: placement.top,
      visibility: 'visible',
      transformOrigin: `${placement.originX} ${placement.placement === 'below' ? 'top' : 'bottom'}`,
    })
    requestAnimationFrame(() => menuRef.current?.focus())
  }, [anchorRect, lift, open, rendered])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, requestClose])

  const renderedTrigger = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<any>, {
        ref: setRefs((trigger as any).ref, triggerRef),
        'aria-haspopup': 'menu',
        'aria-controls': open ? menuId : undefined,
        'aria-expanded': open,
        onClick: (event: React.MouseEvent) => {
          ;(trigger.props as any).onClick?.(event)
          if (!event.defaultPrevented) onOpenChange(!open)
        },
      })
    : null

  const overlay =
    rendered &&
    !(immediateClose && !open) &&
    anchoredMenuHasContent(items.length, Boolean(header))
      ? createPortal(
          <div
            ref={backdropRef}
            className={`anchored-menu-backdrop${closing ? ' closing' : ''}`}
            onPointerDown={requestClose}
            onAnimationEnd={(event) => {
              if (
                shouldFinishOverlayClose(
                  closing,
                  event.target,
                  event.currentTarget,
                )
              )
                finishClose()
            }}
          >
            <div
              id={menuId}
              ref={menuRef}
              className="anchored-menu"
              style={style}
              role="menu"
              aria-label={label}
              tabIndex={-1}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                const rows = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role="menuitem"]:not(:disabled)',
                  ),
                ]
                const index = rows.indexOf(
                  document.activeElement as HTMLButtonElement,
                )
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const step = event.key === 'ArrowDown' ? 1 : -1
                  rows[(index + step + rows.length) % rows.length]?.focus()
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  rows[0]?.focus()
                } else if (event.key === 'End') {
                  event.preventDefault()
                  rows.at(-1)?.focus()
                }
              }}
            >
              {header}
              {items.map((item, index) =>
                item.type === 'separator' ? (
                  <div
                    className="anchored-menu-separator"
                    role="separator"
                    key={item.key ?? `separator-${index}`}
                  />
                ) : (
                  <button
                    role="menuitem"
                    key={item.key}
                    disabled={item.disabled}
                    aria-label={item.ariaLabel}
                    className={`anchored-menu-row${item.destructive ? ' destructive' : ''}`}
                    onClick={() => {
                      void haptic('selection')
                      if (item.destructive || item.removesAnchor)
                        lift.current?.fade()
                      requestClose()
                      item.onSelect()
                    }}
                  >
                    <span className="anchored-menu-icon">{item.icon}</span>
                    <span className="anchored-menu-label">{item.label}</span>
                    {item.detail ? (
                      <small className="anchored-menu-detail">
                        {item.detail}
                      </small>
                    ) : item.checked ? (
                      <Check className="anchored-menu-check" size={16} />
                    ) : null}
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {renderedTrigger}
      {overlay}
    </>
  )
}
