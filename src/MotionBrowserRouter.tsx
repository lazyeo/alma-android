import { createBrowserHistory } from '@remix-run/router'
import { flushSync } from 'react-dom'
import { Router } from 'react-router-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { overlayCount } from './overlayStack'
import {
  decideNavigationMotion,
  installScrollMotionGuard,
  isGestureScrolling,
  prefersReducedMotion,
  type NavigationMotion,
} from './navigationMotion'
import { layoutModeForWidth } from './layout/splitLayout'
import { ALMA_ROUTE } from './desktopRoutes'
import { cancelAlmaTransition, startAlmaTransition } from './alma/almaExpand'
import { reducedMotionPreferred } from './alma/useReducedMotion'

type HistoryUpdate = Parameters<
  Parameters<ReturnType<typeof createBrowserHistory>['listen']>[0]
>[0]
type ViewTransition = {
  ready: Promise<void>
  finished: Promise<void>
  skipTransition?: () => void
}
type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransition
}

const history = createBrowserHistory({ v5Compat: true })

function setMotionAttribute(motion: NavigationMotion) {
  if (motion === 'none')
    document.documentElement.removeAttribute('data-nav-motion')
  else document.documentElement.dataset.navMotion = motion
}

export function MotionBrowserRouter({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => ({
    action: history.action,
    location: history.location,
  }))
  const current = useRef(state.location)
  current.current = state.location

  const apply = useCallback((update: HistoryUpdate) => {
    const motion = decideNavigationMotion(
      current.current,
      update.location,
      update.action,
      update.delta,
      layoutModeForWidth(window.innerWidth),
    )
    const transitionDocument = document as TransitionDocument
    const viewTransitions =
      typeof transitionDocument.startViewTransition === 'function'
    const unobstructed = overlayCount() === 0 && !isGestureScrolling()
    const canAnimate = motion !== 'none' && unobstructed && viewTransitions

    // A newer navigation ends any expand still on screen.
    cancelAlmaTransition()
    const commit = () =>
      flushSync(() =>
        setState({ action: update.action, location: update.location }),
      )

    if (motion === 'alma' && unobstructed) {
      // Alma's expand/collapse owns the commit: inside the View Transition
      // update, or under the covering circle when transitions are missing.
      startAlmaTransition({
        direction: ALMA_ROUTE.test(update.location.pathname) ? 'open' : 'close',
        reduced: reducedMotionPreferred(),
        commit,
        startViewTransition: viewTransitions
          ? (callback) => transitionDocument.startViewTransition!(callback)
          : undefined,
        setNavMotion: setMotionAttribute,
      })
      return
    }

    if (!canAnimate) {
      setMotionAttribute('none')
      setState({ action: update.action, location: update.location })
      return
    }

    const reducedMotion = prefersReducedMotion()
    setMotionAttribute(reducedMotion ? 'fade' : motion)
    const transition = transitionDocument.startViewTransition!(commit)
    void transition.finished.finally(() => setMotionAttribute('none'))
  }, [])

  useLayoutEffect(() => history.listen(apply), [apply])
  useEffect(() => installScrollMotionGuard(), [])

  return (
    <Router
      location={state.location}
      navigationType={state.action}
      navigator={history}
    >
      {children}
    </Router>
  )
}
