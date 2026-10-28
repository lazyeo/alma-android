import { t } from '../i18n/runtime'
import { useEffect, useState } from 'react'
import type { ComposerGoalState } from '../components/ComposerGoal'
import { useDesktopThreadEvents } from '../desktops/ThreadActivityProvider'
import type { AlmaApi } from '../relay/almaApi'
import { isUnsupportedEndpoint } from '../relay'
import { parseGoal, type ThreadGoal } from './threadGoal'
import { type ThreadLoop } from './threadLoop'

export function useComposerGoal({
  api,
  desktopId,
  threadId,
  model,
  status,
  onStarted,
}: {
  api: AlmaApi
  desktopId: string
  threadId: string
  model: string
  status: string
  onStarted(): void
}): ComposerGoalState {
  const [goal, setGoal] = useState<ThreadGoal | null>(null)
  const [loop, setLoop] = useState<ThreadLoop | null>(null)
  const [loading, setLoading] = useState(true)
  const [unsupported, setUnsupported] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([api.getGoal(threadId), api.getLoop(threadId)])
      .then(([goalResult, loopResult]) => {
        if (!alive) return
        setGoal(goalResult.goal)
        setLoop(loopResult.loop)
        setUnsupported(false)
        setError('')
      })
      .catch((cause) => {
        if (!alive) return
        const unavailable = isUnsupportedEndpoint(cause)
        setUnsupported(unavailable)
        setError(
          unavailable
            ? t('composer.goalLoop.unavailable')
            : t('composer.goalLoop.loadFailed'),
        )
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [api, threadId, status])
  useDesktopThreadEvents(desktopId, (event) => {
    if (event.type === 'goal_updated' && event.data?.threadId === threadId)
      setGoal(parseGoal(event.data.goal))
  })
  return {
    goal,
    loop,
    loading,
    unsupported,
    error,
    async onSave(condition) {
      const result = await api.setGoal(
        threadId,
        condition,
        goal ? { edit: true } : { model },
      )
      setGoal(result.goal)
      setError('')
      if (result.started) onStarted()
    },
    async onPause(paused) {
      if (!goal) return
      const result = await api.setGoal(threadId, goal.condition, { paused })
      setGoal(result.goal)
      setError('')
    },
    async onClear() {
      await api.clearGoal(threadId)
      setGoal(null)
      setError('')
    },
    async onStartLoop(prompt) {
      const result = await api.setLoop(threadId, prompt, { model })
      setLoop(result.loop)
      setError('')
    },
    async onStopLoop() {
      await api.stopLoop(threadId)
      setLoop((current) =>
        current ? { ...current, stoppedAt: Date.now() } : null,
      )
      setError('')
    },
  }
}
