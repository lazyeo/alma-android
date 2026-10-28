import { useCallback, useEffect, useState } from 'react'
import {
  SPLIT_MIN_WIDTH,
  layoutModeForWidth,
  type LayoutMode,
} from './splitLayout'

const QUERY = `(min-width: ${SPLIT_MIN_WIDTH}px)`
const SIDEBAR_KEY = 'alma-mobile.split-sidebar-collapsed.v1'
const SIDEBAR_EVENT = 'alma-mobile:split-sidebar-change'

const currentMode = (): LayoutMode =>
  typeof window === 'undefined'
    ? 'single'
    : layoutModeForWidth(window.innerWidth)

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState(currentMode)
  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setMode(media.matches ? 'split' : 'single')
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return mode
}

const sidebarCollapsed = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

/** Collapsed state is a local view preference, kept per device. */
export function useSidebarCollapsed(): [
  boolean,
  () => void,
  (collapsed: boolean) => void,
] {
  const [collapsed, setCollapsed] = useState(sidebarCollapsed)
  useEffect(() => {
    const sync = () => setCollapsed(sidebarCollapsed())
    window.addEventListener(SIDEBAR_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SIDEBAR_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const update = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
    } catch {
      // Storage can be unavailable (private mode); the toggle still works.
    }
    setCollapsed(next)
    window.dispatchEvent(new Event(SIDEBAR_EVENT))
  }, [])
  const toggle = useCallback(() => update(!sidebarCollapsed()), [update])
  return [collapsed, toggle, update]
}
