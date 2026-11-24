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
import type { VoiceInput } from '../speech/VoiceInput'

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
  /**
   * Folds into a one-line capsule, its options row opening from an arrow
   * (a thread's composer). Off, the options always show (a new thread).
   */
  collapsible?: boolean
  /** Voice input: the text box's long press, its hint and the hold view. */
  voice?: Pick<VoiceInput, 'textHold' | 'hint' | 'view' | 'charging'>
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
  collapsible = false,
  voice,
  textareaRef,
  onTextareaKeyDown,
  textareaProps,
}: ComposerProps) {
  const t = useT()
  const [sheet, setSheet] = useState<Sheet>(null)
  const selected = models.find((candidate) => candidate.id === model)
  const groups = useMemo(() => groupModelsByProvider(models), [models])
  const project = projects.find((candidate) => candidate.id === projectId)
  // A collapsible composer rests as one capsule; its options row (attach,
  // model, effort, Send) opens below it from the arrow, or by itself when
  // typing starts, giving back the usual layout.
  const [open, setOpen] = useState(false)
  const folds = collapsible && !expanded
  // Folded, Send rides in the capsule; open, it is back at the row's end.
  const sendInCapsule = folds && !open
  const send = () => {
    if (folds) setOpen(false)
    onSend()
  }
  const sendButton = (
    <button
      className={`send${generating ? ' queue-send' : ''}`}
      aria-label={generating ? t('composer.queueFollowUp') : t('composer.send')}
      disabled={disabled || sending}
      onClick={send}
    >
      <span className="send-icons" aria-hidden="true">
        <ArrowUp {...ICON} className="send-icon-send" />
        <ListPlus {...ICON} className="send-icon-queue" />
      </span>
    </button>
  )
  const controls = (
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
      {sendInCapsule ? null : (
        <>
          <span className="composer-spacer" />
          {sendButton}
        </>
      )}
    </div>
  )
  // Folding, the row opens and closes in height below the text, so the
  // whole composer grows and the message list above gives way (it keeps
  // the latest message in view; see useLatestInView). Closed it is inert
  // and hidden from assistive tech, but mounted, so the attachment control
  // keeps its state.
  const options = folds ? (
    <div
      className="composer-fold"
      data-open={open}
      aria-hidden={open ? undefined : true}
      {...(open ? {} : ({ inert: '' } as Record<string, string>))}
    >
      {controls}
    </div>
  ) : (
    controls
  )
  return (
    <>
      <div
        className={`composer${expanded ? ' expanded' : ''}`}
        data-open={folds ? open : undefined}
      >
        {leading}
        {attachmentTray}
        {/* The capsule: what a long press turns into the hold. */}
        <div
          className="composer-entry"
          data-hold-area
          data-charging={voice?.charging || undefined}
        >
          {folds ? (
            <button
              type="button"
              className="quiet-icon-button composer-more"
              aria-expanded={open}
              aria-label={
                open ? t('composer.options.hide') : t('composer.options.show')
              }
              onClick={() => {
                void haptic('selection')
                setOpen(!open)
              }}
            >
              {/* Points the way the row opens: down, then up to close. */}
              <ChevronDown {...ICON} />
            </button>
          ) : null}
          <div className="composer-input">
            {inputBackdrop}
            <textarea
              {...textareaProps}
              // The full-screen editor is for typing: no long press there.
              {...(expanded ? undefined : voice?.textHold)}
              ref={textareaRef}
              rows={1}
              value={value}
              // The empty box says what a tap and a hold do; the full-screen
              // editor is for typing only.
              placeholder={(!expanded && voice?.hint) || placeholder}
              onFocus={(event) => {
                textareaProps?.onFocus?.(event)
                if (folds) setOpen(true)
              }}
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
                  send()
                }
              }}
            />
          </div>
          {sendInCapsule && (!disabled || sending) ? sendButton : null}
        </div>
        {trailing}
        {options}
        {voice?.view}
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

export function OptionRow({
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
