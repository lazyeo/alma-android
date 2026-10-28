import { useLayoutEffect, type RefObject } from 'react'

/**
 * Positions a `.thread-tabs` underline under the selected tab via `--tab-x`
 * and `--tab-w`, re-measuring on resize and font load.
 */
export function useTabIndicator(
  tabListRef: RefObject<HTMLDivElement | null>,
  selected: unknown,
) {
  useLayoutEffect(() => {
    const tabList = tabListRef.current
    if (!tabList) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const current = tabList.querySelector<HTMLElement>(
        '[aria-selected="true"]',
      )
      if (!current) return
      tabList.style.setProperty('--tab-x', `${current.offsetLeft}px`)
      tabList.style.setProperty('--tab-w', `${current.offsetWidth}px`)
      tabList.dataset.tabReady = 'true'
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(tabList)
    for (const button of tabList.querySelectorAll('button'))
      observer.observe(button)
    window.addEventListener('resize', measure)
    void document.fonts.ready.then(measure)
    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [tabListRef, selected])
}
