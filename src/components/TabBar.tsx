import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { haptic } from '../haptics'
import { useTabIndicator } from './useTabIndicator'

export interface TabBarItem<T extends string> {
  value: T
  label: string
  count?: number
  icon?: LucideIcon
}

export function shouldCompactTabBar(
  availableWidth: number,
  fullContentWidth: number,
  hasIcons = true,
  compactAtWidth?: number,
) {
  return (
    hasIcons &&
    (fullContentWidth > availableWidth + 0.5 ||
      (compactAtWidth !== undefined && availableWidth <= compactAtWidth))
  )
}

export function shouldShowTabLabel<T extends string>(
  value: T,
  selected: T,
  compact: boolean,
  selectedLabelOnly: boolean,
) {
  return !compact && (!selectedLabelOnly || value === selected)
}

/** Shared measured tab row for root-page views and GTD status segments. */
export function TabBar<T extends string>({
  items,
  selected,
  onSelect,
  label,
  className = '',
  trailing,
  selectedLabelOnly = false,
  compactAtWidth,
}: {
  items: readonly TabBarItem<T>[]
  selected: T
  onSelect(value: T): void
  label: string
  className?: string
  trailing?: ReactNode
  selectedLabelOnly?: boolean
  compactAtWidth?: number
}) {
  const tabListRef = useRef<HTMLDivElement>(null)
  const fullMeasureRef = useRef<HTMLDivElement>(null)
  const hasIcons = items.some((item) => item.icon)
  const [compact, setCompact] = useState(false)
  useTabIndicator(tabListRef, selected)

  useLayoutEffect(() => {
    const list = tabListRef.current
    const measure = fullMeasureRef.current
    if (!list || !measure || !hasIcons) {
      setCompact(false)
      return
    }
    const update = () =>
      setCompact(
        shouldCompactTabBar(
          list.clientWidth,
          measure.scrollWidth,
          hasIcons,
          compactAtWidth,
        ),
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(list)
    return () => observer.disconnect()
  }, [compactAtWidth, hasIcons, items, selected, selectedLabelOnly])

  return (
    <div
      ref={tabListRef}
      className={`thread-tabs tab-bar-list${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={label}
    >
      <div
        ref={fullMeasureRef}
        className="tab-bar-full-measure"
        aria-hidden="true"
      >
        {items.map((item) => {
          const Icon = item.icon
          return (
            <span key={item.value}>
              {Icon ? <Icon /> : null}
              {shouldShowTabLabel(
                item.value,
                selected,
                false,
                selectedLabelOnly,
              ) ? (
                <span>{item.label}</span>
              ) : null}
              {item.count === undefined ? null : <small>{item.count}</small>}
            </span>
          )
        })}
      </div>
      {items.map((item) => {
        const Icon = item.icon
        const accessibleLabel =
          item.count === undefined ? item.label : `${item.label}, ${item.count}`
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={selected === item.value}
            aria-label={accessibleLabel}
            title={compact ? accessibleLabel : undefined}
            onClick={() => {
              onSelect(item.value)
              void haptic('selection')
            }}
          >
            {Icon ? (
              <Icon className="tab-bar-icon" size={16} aria-hidden="true" />
            ) : null}
            {shouldShowTabLabel(
              item.value,
              selected,
              compact,
              selectedLabelOnly,
            ) ? (
              <span className="tab-bar-label">{item.label}</span>
            ) : null}
            {item.count === undefined ? null : <small>{item.count}</small>}
          </button>
        )
      })}
      {trailing}
      <span className="tab-bar-indicator" aria-hidden="true" />
    </div>
  )
}
