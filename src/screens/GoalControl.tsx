import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { useDesktopThreadEvents } from '../desktops/ThreadActivityProvider'
import { useConnection } from '../desktops/DesktopContext'
import { isUnsupportedEndpoint } from '../relay'
import { goalStatus, parseGoal, type ThreadGoal } from './threadGoal'
import { haptic } from '../haptics'
import { useT } from '../i18n'

export function GoalControl({
  threadId,
  model,
  onStarted,
}: {
  threadId: string
  model: string
  onStarted(): void
}) {
  const { api, pairing, status } = useConnection()
  const t = useT()
  const [goal, setGoal] = useState<ThreadGoal | null>(null)
  const [open, setOpen] = useState(false),
    [condition, setCondition] = useState('')
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [unsupported, setUnsupported] = useState(false)
  const [clearing, setClearing] = useState(false)
  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .getGoal(threadId)
      .then((result) => {
        if (alive) {
          setGoal(result.goal)
          setError('')
          setUnsupported(false)
        }
      })
      .catch((error) => {
        if (alive) {
          setUnsupported(isUnsupportedEndpoint(error))
          setError(
            isUnsupportedEndpoint(error)
              ? t('composer.goal.unavailable')
              : t('composer.goal.loadFailed'),
          )
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [api, threadId, status, open])
  useDesktopThreadEvents(pairing.id, (event) => {
    if (event.type === 'goal_updated' && event.data?.threadId === threadId)
      setGoal(parseGoal(event.data.goal))
  })
  async function save() {
    setBusy(true)
    setError('')
    try {
      const result = await api.setGoal(
        threadId,
        condition,
        goalStatus(goal) === 'active' ? { edit: true } : { model },
      )
      setGoal(result.goal)
      setOpen(false)
      void haptic()
      if (result.started) onStarted()
    } catch {
      setError(t('composer.goal.saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  async function clear() {
    setBusy(true)
    setError('')
    try {
      await api.clearGoal(threadId)
      setGoal(null)
      setClearing(false)
      setOpen(false)
      void haptic()
    } catch {
      setError(t('composer.goal.clearFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        className={`goal-control${goalStatus(goal) === 'active' ? ' goal-banner' : ''}`}
        aria-label={
          goal
            ? t('composer.goal.current', {
                status: t(`composer.goal.status.${goalStatus(goal)}`),
              })
            : t('composer.goal.set')
        }
        onClick={() => {
          void haptic('light')
          setCondition(goal?.condition ?? '')
          setClearing(false)
          setOpen(true)
        }}
      >
        <Target size={16} />
        <span>
          {goalStatus(goal) === 'active'
            ? goal?.condition
            : t('composer.goal.label')}
        </span>
      </button>
      {open ? (
        <BottomSheet
          title={t('composer.goal.title')}
          onClose={() => {
            if (!busy) setOpen(false)
          }}
          footer={
            <div className="goal-actions">
              <button
                className="primary"
                disabled={busy || loading || unsupported || !condition.trim()}
                onClick={() => void save()}
              >
                {busy
                  ? t('composer.goal.saving')
                  : goalStatus(goal) === 'active'
                    ? t('composer.goal.saveChanges')
                    : t('composer.goal.set')}
              </button>
              {goal ? (
                <button
                  className="danger"
                  disabled={busy || loading}
                  onClick={() => (clearing ? void clear() : setClearing(true))}
                >
                  {clearing
                    ? t('composer.goal.confirmClearGoal')
                    : t('composer.goal.clear')}
                </button>
              ) : null}
            </div>
          }
        >
          {loading ? <p role="status">{t('composer.goal.loading')}</p> : null}
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          {goal ? (
            <div className="goal-summary">
              <strong>{t(`composer.goal.status.${goalStatus(goal)}`)}</strong>
              <p>{goal.condition}</p>
              <small>
                {t('composer.goal.turnsEvaluated', {
                  count: goal.turnsEvaluated,
                })}
              </small>
              {goal.lastReason ? <p>{goal.lastReason}</p> : null}
            </div>
          ) : null}
          <label className="goal-editor">
            {t('composer.goal.condition')}
            <textarea
              value={condition}
              disabled={busy || unsupported || loading}
              onChange={(event) => setCondition(event.target.value)}
              placeholder={t('composer.goal.conditionPlaceholder')}
              rows={4}
            />
          </label>
          <p className="muted">{t('composer.goal.note')}</p>
        </BottomSheet>
      ) : null}
    </>
  )
}
