import { useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import type { CompactResult } from '../relay/almaApi'
import {
  contextLevel,
  formatTokens,
  pieSectorPath,
  type ContextUsage,
  type GenerationUsage,
  type SessionUsage,
} from './contextUsage'
import { LoadingOrb } from './LoadingOrbCanvas'
import { t as runtimeT, useT } from '../i18n'

/** Header button: a filled pie whose color tracks the context level. */
export function ContextRing({
  usage,
  onOpen,
}: {
  usage: ContextUsage
  onOpen: () => void
}) {
  const t = useT()
  const percent = Math.round(usage.usagePercent)
  const level = contextLevel(usage.usagePercent)
  return (
    <span className="context-indicator" data-level={level}>
      <button
        className="header-action-button context-ring"
        aria-haspopup="dialog"
        aria-label={t('composer.context.used', { percent })}
        title={t('composer.context.used', { percent })}
        onClick={onOpen}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle className="context-pie-track" cx="10" cy="10" r="9" />
          <path
            className="context-pie-value"
            d={pieSectorPath(usage.usagePercent)}
          />
        </svg>
      </button>
    </span>
  )
}

type CompactState =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'running' }
  | { kind: 'done'; result: CompactResult }
  | { kind: 'error'; message: string }

export function compactSummary(result: CompactResult, t = runtimeT) {
  if (!result.success)
    return result.error || t('composer.context.summary.failed')
  if (result.compactedCount !== undefined && result.savedTokens !== undefined)
    return t('composer.context.summary.messagesAndTokens', {
      count: result.compactedCount,
      tokens: formatTokens(result.savedTokens),
    })
  if (result.compactedCount !== undefined)
    return t('composer.context.summary.messages', {
      count: result.compactedCount,
    })
  if (result.savedTokens !== undefined)
    return t('composer.context.summary.tokens', {
      tokens: formatTokens(result.savedTokens),
    })
  return t('composer.context.summary.done')
}

export function ContextUsageSheet({
  usage,
  session,
  generating,
  onCompact,
  onClose,
}: {
  usage: ContextUsage
  session: SessionUsage
  generating: boolean
  onCompact: () => Promise<CompactResult>
  onClose: () => void
}) {
  const t = useT()
  const [compact, setCompact] = useState<CompactState>({ kind: 'idle' })
  const level = contextLevel(usage.usagePercent)

  async function runCompact() {
    setCompact({ kind: 'running' })
    try {
      setCompact({ kind: 'done', result: await onCompact() })
    } catch (error) {
      setCompact({
        kind: 'error',
        message:
          error instanceof Error ? error.message : t('composer.context.failed'),
      })
    }
  }

  const footer =
    compact.kind === 'confirm' ? (
      <div
        className="context-confirm"
        role="group"
        aria-label={t('composer.context.confirmLabel')}
      >
        <p>{t('composer.context.confirm')}</p>
        <div>
          <button
            className="secondary"
            onClick={() => setCompact({ kind: 'idle' })}
          >
            {t('common.cancel')}
          </button>
          <button className="primary" onClick={() => void runCompact()}>
            {t('composer.context.confirmAction')}
          </button>
        </div>
      </div>
    ) : (
      <button
        className="sheet-footer-action"
        // Compacting would race the running turn's writes; wait for it.
        disabled={generating || compact.kind === 'running'}
        onClick={() => setCompact({ kind: 'confirm' })}
      >
        {compact.kind === 'running' ? <LoadingOrb size={16} /> : null}
        {compact.kind === 'running'
          ? t('composer.context.compacting')
          : t('composer.context.compact')}
      </button>
    )

  return (
    <BottomSheet
      title={t('composer.context.title')}
      className="context-sheet"
      onClose={onClose}
      footer={footer}
    >
      <section className="sheet-section" aria-labelledby="context-heading">
        <h3 id="context-heading">{t('composer.context.window')}</h3>
        <div className={`context-meter ${level}`}>
          <strong>{Math.round(usage.usagePercent)}%</strong>
          <span>
            {usage.contextWindow
              ? t('composer.context.tokensOf', {
                  count: formatTokens(usage.totalTokens),
                  total: formatTokens(usage.contextWindow),
                })
              : t('composer.context.tokens', {
                  count: formatTokens(usage.totalTokens),
                })}
          </span>
        </div>
        <div
          className={`context-bar ${level}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage.usagePercent)}
        >
          <span
            style={{
              width: `${Math.min(100, Math.max(0, usage.usagePercent))}%`,
            }}
          />
        </div>
        {generating ? (
          <p className="sheet-note">{t('composer.context.afterReply')}</p>
        ) : null}
        <p className="sheet-status" role="status" aria-live="polite">
          {compact.kind === 'done' ? compactSummary(compact.result, t) : null}
        </p>
        {compact.kind === 'error' ? (
          <p className="sheet-error" role="alert">
            {compact.message}
          </p>
        ) : null}
      </section>
      <section className="sheet-section" aria-labelledby="session-heading">
        <h3 id="session-heading">{t('composer.context.session')}</h3>
        {session.turns ? (
          <dl className="usage-grid">
            <dt>{t('composer.context.replies')}</dt>
            <dd>{session.turns}</dd>
            <dt>{t('composer.context.input')}</dt>
            <dd>{formatTokens(session.inputTokens)}</dd>
            <dt>{t('composer.context.output')}</dt>
            <dd>{formatTokens(session.outputTokens)}</dd>
            <dt>{t('composer.context.reasoning')}</dt>
            <dd>{formatTokens(session.reasoningTokens)}</dd>
            <dt>{t('composer.context.cacheRead')}</dt>
            <dd>{formatTokens(session.cachedInputTokens)}</dd>
            <dt>{t('composer.context.cacheWrite')}</dt>
            <dd>{formatTokens(session.cacheWriteInputTokens)}</dd>
            <dt>{t('composer.context.total')}</dt>
            <dd>{formatTokens(session.totalTokens)}</dd>
          </dl>
        ) : (
          <p className="sheet-note">{t('composer.context.noUsage')}</p>
        )}
      </section>
    </BottomSheet>
  )
}

/** Token footer for the reply a `generation_completed` event reported. */
export function UsageFooter({ usage }: { usage: GenerationUsage }) {
  const t = useT()
  const items = [
    ['in', usage.inputTokens],
    ['out', usage.outputTokens],
    ['reasoning', usage.reasoningTokens],
    ['cached', usage.cachedInputTokens],
    ['cacheWrite', usage.cacheWriteInputTokens],
  ] as const
  return (
    <footer
      className="usage-footer"
      aria-label={t('composer.context.replyUsage')}
    >
      {items
        .filter(([key, value]) => value > 0 || key === 'in' || key === 'out')
        .map(([key, value]) => (
          <span key={key}>
            {t(`composer.context.footer.${key}`, {
              tokens: formatTokens(value),
            })}
          </span>
        ))}
      <span>
        {t('composer.context.footer.total', {
          tokens: formatTokens(usage.totalTokens),
        })}
      </span>
    </footer>
  )
}
