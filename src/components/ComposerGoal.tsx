import {
  ChevronRight,
  Pause,
  Play,
  Repeat2,
  Square,
  Target,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { haptic } from '../haptics'
import { goalStatus, type ThreadGoal } from '../screens/threadGoal'
import { formatLoopSchedule } from '../uiCopy'
import {
  formatLoopInterval,
  loopStatus,
  parseLoopPrompt,
  type ThreadLoop,
} from '../screens/threadLoop'
import { BottomSheet } from './BottomSheet'
import { useT } from '../i18n'

export type ComposerGoalState = {
  goal: ThreadGoal | null
  loop: ThreadLoop | null
  loading?: boolean
  unsupported?: boolean
  error?: string
  onSave(condition: string): Promise<void>
  onPause(paused: boolean): Promise<void>
  onClear(): Promise<void>
  onStartLoop(prompt: string): Promise<void>
  onStopLoop(): Promise<void>
}

export function ComposerGoal({
  state,
  variant,
}: {
  state: ComposerGoalState
  variant: 'strip' | 'sheet-row'
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [condition, setCondition] = useState('')
  const [loopPrompt, setLoopPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [clearing, setClearing] = useState(false)
  const status = goalStatus(state.goal)
  const statusLabel = t(`composer.goal.status.${status}`)
  const loopState = t(`composer.loop.status.${loopStatus(state.loop)}`)
  const loopPreview = parseLoopPrompt(loopPrompt)
  useEffect(() => {
    if (open) {
      setCondition(state.goal?.condition ?? '')
      setLoopPrompt('')
    }
  }, [open, state.goal])

  async function act(action: () => Promise<void>, close = false) {
    setBusy(true)
    try {
      await action()
      void haptic()
      if (close) setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {variant === 'strip' ? (
        <div className="composer-goal-strips">
          {state.goal ? (
            <button
              className="composer-goal-strip"
              onClick={() => setOpen(true)}
              aria-label={t('composer.goal.current', { status: statusLabel })}
            >
              <Target size={15} strokeWidth={2} />
              <span>{state.goal.condition}</span>
              <small>{statusLabel}</small>
              <ChevronRight size={15} />
            </button>
          ) : null}
          {state.loop && !state.loop.stoppedAt ? (
            <button
              className="composer-loop-strip"
              onClick={() => setOpen(true)}
              aria-label={t('composer.loop.current', { status: loopState })}
            >
              <Repeat2 size={15} strokeWidth={2} />
              <span>{state.loop.prompt}</span>
              <small>
                {formatLoopSchedule(
                  formatLoopInterval(state.loop.intervalMs),
                  state.loop.iterations,
                )}
              </small>
              <ChevronRight size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
      {variant === 'sheet-row' ? (
        <button
          className="composer-goal-sheet-row"
          aria-label={
            state.goal || state.loop
              ? t('composer.goalLoop.edit')
              : t('composer.goalLoop.set')
          }
          onClick={() => {
            void haptic('light')
            setClearing(false)
            setOpen(true)
          }}
        >
          <Target size={20} strokeWidth={2} />
          <span>{t('composer.goalLoop.row')}</span>
          {state.goal || (state.loop && !state.loop.stoppedAt) ? (
            <small>
              {status === 'paused'
                ? t('composer.goalLoop.paused')
                : t('composer.goalLoop.active')}
            </small>
          ) : null}
        </button>
      ) : null}
      {open ? (
        <BottomSheet
          title={t('composer.goalLoop.title')}
          className="goal-loop-sheet"
          onClose={() => {
            if (!busy) setOpen(false)
          }}
        >
          {state.loading ? (
            <p role="status">{t('composer.goalLoop.loading')}</p>
          ) : null}
          {state.error ? (
            <p role="alert" className="error">
              {state.error}
            </p>
          ) : null}

          <section className="goal-loop-section">
            <header>
              <span className="goal-loop-icon">
                <Target size={17} strokeWidth={2} />
              </span>
              <div>
                <h3>{t('composer.goalLoop.untilTitle')}</h3>
                <p>{t('composer.goalLoop.untilNote')}</p>
              </div>
            </header>
            {state.goal ? (
              <div className="goal-loop-active">
                <div>
                  <strong>{statusLabel}</strong>
                  <p>{state.goal.condition}</p>
                  <small>
                    {t('composer.goal.turnsEvaluated', {
                      count: state.goal.turnsEvaluated,
                    })}
                  </small>
                  {state.goal.lastReason ? (
                    <small>{state.goal.lastReason}</small>
                  ) : null}
                </div>
                {status !== 'achieved' ? (
                  <button
                    className="goal-loop-icon-button"
                    aria-label={
                      status === 'paused'
                        ? t('composer.goal.resume')
                        : t('composer.goal.pause')
                    }
                    disabled={busy || state.loading}
                    onClick={() =>
                      void act(() => state.onPause(status !== 'paused'))
                    }
                  >
                    {status === 'paused' ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}
                  </button>
                ) : null}
              </div>
            ) : null}
            <label className="goal-loop-input">
              <span>{t('composer.goal.condition')}</span>
              <textarea
                value={condition}
                disabled={busy || state.unsupported || state.loading}
                onChange={(event) => setCondition(event.target.value)}
                placeholder={t('composer.goal.conditionExample')}
                rows={3}
              />
            </label>
            <div className="goal-loop-actions">
              {state.goal ? (
                <button
                  className="danger ghost"
                  disabled={busy || state.loading}
                  onClick={() =>
                    clearing ? void act(state.onClear) : setClearing(true)
                  }
                >
                  {clearing
                    ? t('composer.goal.confirmClear')
                    : t('composer.goal.clear')}
                </button>
              ) : null}
              <button
                className="primary"
                disabled={
                  busy ||
                  state.loading ||
                  state.unsupported ||
                  !condition.trim()
                }
                onClick={() => void act(() => state.onSave(condition))}
              >
                {busy
                  ? t('composer.goal.saving')
                  : state.goal
                    ? t('composer.goal.save')
                    : t('composer.goal.start')}
              </button>
            </div>
          </section>

          <section className="goal-loop-section loop-section">
            <header>
              <span className="goal-loop-icon">
                <Repeat2 size={17} strokeWidth={2} />
              </span>
              <div>
                <h3>{t('composer.loop.scheduleTitle')}</h3>
                <p>{t('composer.loop.scheduleNote')}</p>
              </div>
            </header>
            {state.loop ? (
              <div
                className={`goal-loop-active${state.loop.stoppedAt ? ' stopped' : ''}`}
              >
                <div>
                  <strong>{loopState}</strong>
                  <p>{state.loop.prompt}</p>
                  <small>
                    {formatLoopSchedule(
                      formatLoopInterval(state.loop.intervalMs),
                      state.loop.iterations,
                    )}
                  </small>
                </div>
                {!state.loop.stoppedAt ? (
                  <button
                    className="goal-loop-icon-button"
                    aria-label={t('composer.loop.stop')}
                    disabled={busy || state.loading}
                    onClick={() => void act(state.onStopLoop)}
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : null}
              </div>
            ) : null}
            <label className="goal-loop-input">
              <span>{t('composer.loop.prompt')}</span>
              <textarea
                value={loopPrompt}
                disabled={busy || state.unsupported || state.loading}
                onChange={(event) => setLoopPrompt(event.target.value)}
                placeholder={t('composer.loop.promptExample')}
                rows={3}
              />
            </label>
            <div className="goal-loop-actions">
              <span className="loop-preview">
                {loopPreview.intervalMs
                  ? t('composer.loop.every', {
                      interval: formatLoopInterval(loopPreview.intervalMs),
                    })
                  : t('composer.loop.defaultInterval')}
              </span>
              <button
                className="primary"
                disabled={
                  busy ||
                  state.loading ||
                  state.unsupported ||
                  !loopPrompt.trim()
                }
                onClick={() => void act(() => state.onStartLoop(loopPrompt))}
              >
                {busy ? t('composer.loop.starting') : t('composer.loop.start')}
              </button>
            </div>
          </section>
        </BottomSheet>
      ) : null}
    </>
  )
}
