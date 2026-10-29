import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import type { MessagePart } from './index'
import { EndResourceCards } from './EndResourceCards'
import { PartView, type PartViewCapabilities } from './PartView'
import type { NestedMessageRow } from './ToolPart'
import { LoadingOrb } from '../screens/LoadingOrbCanvas'
import { deriveEndResources } from '../screens/endResources'
import { replyEndReason } from '../screens/replyMetadata'
import {
  groupParts,
  reasoningDuration,
  reasoningLive,
  toolState,
} from '../screens/streamingPresentation'
import { replyWorkedDuration } from '../screens/toolDurations'
import { formatElapsed } from '../screens/threadStatus'
import { useSharedSecond } from '../screens/useSharedSecond'
import { useT } from '../i18n'

export interface MessageRowView {
  id: string
  message: { role: string; parts: MessagePart[] }
  metadata?: {
    versionIndex?: number
    versionCount?: number
    reasoningDuration?: unknown
    optimisticStatus?: unknown
    [key: string]: unknown
  }
}

export function MessageView({
  row,
  nestedByParent,
  onActions,
  onSwitchVersion,
  onRetryFailed,
  generating = false,
  usage,
  workspacePath,
  capabilities,
  longPressProps,
  renderUsage,
  onOpenFile,
  onOpenWebsite,
  below,
}: {
  row: MessageRowView
  generating?: boolean
  usage?: unknown
  workspacePath?: string
  nestedByParent?: ReadonlyMap<string, NestedMessageRow[]>
  onActions?: (row: MessageRowView) => void
  onSwitchVersion?: (row: MessageRowView, direction: 'prev' | 'next') => void
  onRetryFailed?: (row: MessageRowView) => void
  capabilities: PartViewCapabilities
  longPressProps?: HTMLAttributes<HTMLElement>
  renderUsage?: (usage: unknown) => ReactNode
  onOpenFile?: (path: string) => void
  onOpenWebsite?: (target: string) => void
  below?: ReactNode
}) {
  const t = useT()
  const versionIndex = Number(row.metadata?.versionIndex) || 0
  const versionCount = Number(row.metadata?.versionCount) || 0
  const now = useSharedSecond(generating)
  const workedDuration = replyWorkedDuration(
    row.message.parts,
    generating || row.metadata?.optimisticStatus === 'pending',
    now,
  )
  const endReason = replyEndReason(row as never)
  const endResources =
    row.message.role === 'assistant' && !generating
      ? deriveEndResources(
          { parts: row.message.parts, metadata: row.metadata },
          workspacePath,
        )
      : []
  const footerHasMetadata =
    versionCount > 1 ||
    Boolean(usage) ||
    workedDuration !== undefined ||
    Boolean(endReason)
  return (
    <article {...longPressProps} className={`message ${row.message.role}`}>
      {groupParts(row.message.parts).map((group) => {
        const content = group.parts.map((part, index) => (
          <PartView
            key={`${part.type}-${group.indices[index]}`}
            part={part}
            duration={reasoningDuration(part, row.metadata?.reasoningDuration)}
            live={reasoningLive(
              row.message.parts,
              group.indices[index],
              generating,
            )}
            nested={
              part.toolCallId ? nestedByParent?.get(part.toolCallId) : undefined
            }
            linkUserFilePaths={row.message.role === 'assistant'}
            capabilities={capabilities}
          />
        ))
        const active = group.parts.find((part) => toolState(part) === 'running')
        return group.tools && group.parts.length >= 3 ? (
          <details className="tool-group" key={group.indices[0]}>
            <summary>
              {t('message.ranActions', { count: group.parts.length })}{' '}
              {active ? (
                <span>
                  <LoadingOrb size={14} />
                  {active.type.replace(/^tool-/, '')}
                </span>
              ) : null}
            </summary>
            {content}
          </details>
        ) : (
          <div key={group.indices[0]}>{content}</div>
        )
      })}
      {row.message.role === 'assistant' && !generating ? (
        <EndResourceCards
          resources={endResources}
          workspacePath={workspacePath}
          onOpenFile={onOpenFile}
          onOpenWebsite={onOpenWebsite}
        />
      ) : null}
      {row.metadata?.optimisticStatus === 'pending' ? (
        <p className="message-delivery-status">{t('message.sending')}</p>
      ) : row.metadata?.optimisticStatus === 'failed' ? (
        <div className="message-delivery-status failed">
          <span>{t('message.notSent')}</span>
          {onRetryFailed ? (
            <button onClick={() => onRetryFailed(row)}>
              <RefreshCw size={13} />
              {t('common.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      <footer
        className={`message-footer${footerHasMetadata ? '' : ' actions-only'}`}
      >
        <div className="message-footer-meta">
          {usage && renderUsage ? renderUsage(usage) : null}
          {versionCount > 1 && onSwitchVersion ? (
            <div className="version-switcher" aria-label={t('message.version')}>
              <button
                disabled={versionIndex <= 0}
                onClick={() => onSwitchVersion(row, 'prev')}
              >
                <ChevronLeft />
              </button>
              <span>
                {versionIndex + 1}/{versionCount}
              </span>
              <button
                disabled={versionIndex >= versionCount - 1}
                onClick={() => onSwitchVersion(row, 'next')}
              >
                <ChevronRight />
              </button>
            </div>
          ) : null}
          {workedDuration !== undefined ? (
            <time className="worked-duration">
              {t('message.workedFor', {
                duration: formatElapsed(workedDuration),
              })}
            </time>
          ) : null}
          {endReason ? (
            <span className={`turn-end-reason ${endReason.tone}`}>
              {endReason.label}
            </span>
          ) : null}
          {onActions && row.message.role === 'assistant' ? (
            <button
              className="message-actions-button"
              aria-label={t('message.actions.label')}
              onClick={() => onActions(row)}
            >
              <MoreHorizontal size={16} />
            </button>
          ) : null}
        </div>
      </footer>
      {below}
    </article>
  )
}
