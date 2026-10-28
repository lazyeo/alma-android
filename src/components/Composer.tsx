import { ArrowUp, Brain, Check, ChevronDown, ListPlus, Zap } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { AlmaModel, ReasoningEffort, Workspace } from '../relay'
import { haptic } from '../haptics'
import {
  effortLabel,
  groupModelsByProvider,
  reasoningEffortsForModel,
  shortModelName,
  supportsFastMode,
  supportsReasoningEffort,
} from '../screens/modelOptions'
import { BottomSheet } from './BottomSheet'
import { useT } from '../i18n'

const ICON = { size: 16, strokeWidth: 2 } as const

type ComposerProps = {
  value: string
  onChange(
    value: string,
    textarea: HTMLTextAreaElement,
    isComposing: boolean,
  ): void
  onSend(): void
  placeholder: string
  model: string
  models: AlmaModel[]
  onModelChange(model: string): void
  effort: 'off' | ReasoningEffort
  onEffortChange(effort: 'off' | ReasoningEffort): void
  fastMode?: boolean
  onFastModeChange?(): void
  attachmentTray?: ReactNode
  attachmentControl: ReactNode
  projectId?: string
  projects?: Workspace[]
  onProjectChange?(projectId: string): void
  disabled?: boolean
  sending?: boolean
  generating?: boolean
  leading?: ReactNode
  /** Full-screen editor mode: the textarea fills the available height. */
  expanded?: boolean
  inputBackdrop?: ReactNode
  trailing?: ReactNode
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  onTextareaKeyDown?(event: KeyboardEvent<HTMLTextAreaElement>): boolean | void
  textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>
}

type Sheet = 'project' | 'model' | 'effort' | null

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  model,
  models,
  onModelChange,
  effort,
  onEffortChange,
  fastMode = false,
  onFastModeChange,
  attachmentTray,
  attachmentControl,
  projectId,
  projects = [],
  onProjectChange,
  disabled,
  sending,
  generating,
  leading,
  expanded = false,
  inputBackdrop,
  trailing,
  textareaRef,
  onTextareaKeyDown,
  textareaProps,
}: ComposerProps) {
  const t = useT()
  const [sheet, setSheet] = useState<Sheet>(null)
  const selected = models.find((candidate) => candidate.id === model)
  const groups = useMemo(() => groupModelsByProvider(models), [models])
  const project = projects.find((candidate) => candidate.id === projectId)
  return (
    <>
      <div className={`composer${expanded ? ' expanded' : ''}`}>
        {leading}
        {attachmentTray}
        <div className="composer-input">
          {inputBackdrop}
          <textarea
            {...textareaProps}
            ref={textareaRef}
            rows={1}
            value={value}
            placeholder={placeholder}
            onChange={(event) =>
              onChange(
                event.target.value,
                event.target,
                (event.nativeEvent as InputEvent).isComposing,
              )
            }
            onKeyDown={(event) => {
              if (onTextareaKeyDown?.(event) === true) return
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault()
                onSend()
              }
            }}
          />
        </div>
        {trailing}
        <div className="composer-controls">
          {attachmentControl}
          <div className="composer-options">
            {onProjectChange ? (
              <button
                className="composer-chip"
                aria-haspopup="dialog"
                onClick={() => setSheet('project')}
              >
                <span>{project?.name || t('composer.noProject')}</span>
                <ChevronDown size={14} strokeWidth={2} />
              </button>
            ) : null}
            <button
              className="composer-chip"
              aria-haspopup="dialog"
              onClick={() => {
                void haptic('selection')
                setSheet('model')
              }}
            >
              <span>{shortModelName(selected)}</span>
              <ChevronDown size={14} strokeWidth={2} />
            </button>
            {supportsReasoningEffort(selected) ? (
              <button
                className="composer-chip"
                aria-haspopup="dialog"
                aria-label={t('composer.effort.current', {
                  effort: effortLabel(effort),
                })}
                onClick={() => setSheet('effort')}
              >
                <Brain {...ICON} />
                <span>{effortLabel(effort)}</span>
              </button>
            ) : null}
            {supportsFastMode(selected) && onFastModeChange ? (
              <button
                className="composer-chip fast-chip"
                aria-pressed={fastMode}
                aria-label={t('composer.fastMode')}
                onClick={onFastModeChange}
              >
                <Zap {...ICON} />
                <span>{t('composer.fast')}</span>
              </button>
            ) : null}
          </div>
          <span className="composer-spacer" />
          <button
            className={`send${generating ? ' queue-send' : ''}`}
            aria-label={
              generating ? t('composer.queueFollowUp') : t('composer.send')
            }
            disabled={disabled || sending}
            onClick={onSend}
          >
            {generating ? <ListPlus {...ICON} /> : <ArrowUp {...ICON} />}
          </button>
        </div>
      </div>
      {sheet === 'project' ? (
        <BottomSheet
          title={t('composer.project')}
          onClose={() => setSheet(null)}
        >
          <div className="sheet-list">
            <OptionRow
              label={t('composer.noProject')}
              selected={!projectId}
              onClick={() => {
                onProjectChange?.('')
                setSheet(null)
              }}
            />
            {projects.map((candidate) => (
              <OptionRow
                key={candidate.id}
                label={candidate.name}
                detail={candidate.path}
                selected={candidate.id === projectId}
                onClick={() => {
                  onProjectChange?.(candidate.id)
                  setSheet(null)
                }}
              />
            ))}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === 'model' ? (
        <BottomSheet
          title={t('composer.model')}
          className="model-sheet"
          onClose={() => setSheet(null)}
        >
          {groups.map((group) => (
            <div className="sheet-group" key={group.provider}>
              <h3>{group.provider}</h3>
              <div className="sheet-list">
                {group.models.map((candidate) => (
                  <OptionRow
                    key={candidate.id}
                    label={candidate.name}
                    detail={candidate.modelId}
                    selected={candidate.id === model}
                    onClick={() => {
                      void haptic('selection')
                      onModelChange(candidate.id)
                      setSheet(null)
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </BottomSheet>
      ) : null}
      {sheet === 'effort' ? (
        <BottomSheet
          title={t('composer.effort.title')}
          onClose={() => setSheet(null)}
        >
          <div className="sheet-list">
            {reasoningEffortsForModel(selected).map((candidate) => (
              <OptionRow
                key={candidate}
                label={effortLabel(candidate)}
                selected={candidate === effort}
                onClick={() => {
                  void haptic('selection')
                  onEffortChange(candidate)
                  setSheet(null)
                }}
              />
            ))}
          </div>
        </BottomSheet>
      ) : null}
    </>
  )
}

function OptionRow({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string
  detail?: string
  selected: boolean
  onClick(): void
}) {
  return (
    <button
      className={`sheet-row compact${selected ? ' selected' : ''}`}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="sheet-row-copy">
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </span>
      {selected ? (
        <Check className="sheet-row-check" size={18} strokeWidth={2} />
      ) : null}
    </button>
  )
}
