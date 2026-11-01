import { Check, ChevronRight, CircleAlert } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { SettingsRow } from '../components/SettingsRow'
import { useT } from '../i18n'
import { MessageView } from '../messages'
import { ToolIcon } from '../messages/ToolIcon'
import type { AlmaApi } from '../relay/almaApi'
import { ImageGalleryProvider } from '../screens/ImageGallery'
import { LoadingOrb } from '../screens/LoadingOrbCanvas'
import { MarkdownContent } from '../screens/MarkdownContent'
import { RelayImage } from '../screens/RelayImage'
import { useSharedSecond } from '../screens/useSharedSecond'
import { AgentMark } from './AgentMark'
import {
  formatSubagentElapsed,
  subagentStepRows,
  type HerdrSubagentDispatch,
} from './subagents'
import { toMessageRows, type HerdrChatItem } from './toMessageParts'

export function HerdrSubagentPill({
  agent,
  count,
  onClick,
}: {
  agent?: string | null
  count: number
  onClick(): void
}) {
  const t = useT()
  return (
    <button
      className="agent-subagent-pill"
      aria-label={t('agents.subagents')}
      onClick={onClick}
    >
      <AgentMark agent={agent} small />
      {count > 0 ? <span>{count}</span> : null}
    </button>
  )
}

export function HerdrSubagentsSheet({
  api,
  paneId,
  parentAgent,
  subagents,
  initialToolId,
  onClose,
}: {
  api: AlmaApi
  paneId: string
  parentAgent?: string | null
  subagents: HerdrSubagentDispatch[]
  initialToolId?: string
  onClose(): void
}) {
  const t = useT()
  const [selectedToolId, setSelectedToolId] = useState(initialToolId)
  const selected = subagents.find((item) => item.toolId === selectedToolId)
  const now = useSharedSecond(subagents.some((item) => item.running))

  return (
    <BottomSheet
      className="agent-subagents-sheet"
      title={
        selected ? selected.type || t('agents.subagent') : t('agents.subagents')
      }
      onClose={onClose}
      onBack={selected ? () => setSelectedToolId(undefined) : undefined}
    >
      {selected ? (
        <SubagentDetail api={api} paneId={paneId} dispatch={selected} />
      ) : (
        <div className="settings-group agent-subagent-list">
          {subagents.map((subagent) => (
            <SettingsRow
              key={subagent.toolId}
              icon={<AgentMark agent={parentAgent} small />}
              title={subagent.title}
              secondary={subagent.type}
              trailing={
                <span className="settings-row-trailing agent-subagent-trailing">
                  <span className="settings-value">
                    {subagent.running && subagent.startedAt !== undefined
                      ? formatSubagentElapsed(now - subagent.startedAt)
                      : t('agents.subagentDone')}
                  </span>
                  <ChevronRight size={16} />
                </span>
              }
              onClick={() => setSelectedToolId(subagent.toolId)}
            />
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

function SubagentDetail({
  api,
  paneId,
  dispatch,
}: {
  api: AlmaApi
  paneId: string
  dispatch: HerdrSubagentDispatch
}) {
  const t = useT()
  const [items, setItems] = useState<HerdrChatItem[]>([])
  const [description, setDescription] = useState(dispatch.title)
  const [finished, setFinished] = useState(!dispatch.running)
  const [state, setState] = useState<
    'loading' | 'ready' | 'empty' | 'unsupported' | 'error'
  >('loading')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  useEffect(() => {
    let active = true
    let timer = 0
    const poll = async () => {
      try {
        const response = await api.getHerdrSubagent(paneId, dispatch.toolId, {
          limit: 400,
        })
        if (!active) return
        if (response.status === 'unsupported') {
          setState('unsupported')
          return
        }
        if (response.status === 'error') {
          if (
            response.error.code === 'subagent_not_found' &&
            items.length === 0
          ) {
            setState('empty')
            timer = window.setTimeout(poll, 1_500)
          } else setState('error')
          return
        }
        const nextItems = (response.page.items ?? []) as HerdrChatItem[]
        setItems(nextItems)
        setDescription(response.agent.description || dispatch.title)
        setFinished(response.agent.finished)
        setState('ready')
        if (!response.agent.finished) timer = window.setTimeout(poll, 1_500)
      } catch {
        if (active) setState('error')
      }
    }
    void poll()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [api, dispatch.title, dispatch.toolId, paneId])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (scroller && pinnedRef.current)
      scroller.scrollTop = scroller.scrollHeight
  }, [items])

  const steps = useMemo(() => subagentStepRows(items), [items])
  const galleryImages = useMemo(
    () =>
      toMessageRows(items).flatMap((row) =>
        row.message.parts.flatMap((part) =>
          part.type === 'file' &&
          typeof part.url === 'string' &&
          typeof part.mediaType === 'string' &&
          part.mediaType.startsWith('image/')
            ? [
                {
                  source: part.url,
                  name:
                    typeof part.filename === 'string' ? part.filename : 'image',
                },
              ]
            : [],
        ),
      ),
    [items],
  )

  return (
    <ImageGalleryProvider images={galleryImages}>
      <div
        className="agent-subagent-detail"
        ref={scrollerRef}
        onScroll={(event) => {
          const element = event.currentTarget
          pinnedRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 32
        }}
      >
        <div className="agent-subagent-summary">
          <p>{description}</p>
          <span>{t('agents.subagentSteps', { count: steps.length })}</span>
        </div>
        {state === 'loading' ? (
          <div className="agent-subagent-state">
            <LoadingOrb size={18} />
          </div>
        ) : state === 'empty' ? (
          <p className="agent-subagent-state">
            {t('agents.subagentNoTranscript')}
          </p>
        ) : state === 'unsupported' ? (
          <p className="agent-subagent-state">
            {t('agents.subagentUnsupported')}
          </p>
        ) : state === 'error' ? (
          <p className="settings-error agent-subagent-state">
            {t('agents.subagentReadFailed')}
          </p>
        ) : null}
        {items.map((item) => {
          if (item.tool) {
            const step = subagentStepRows([item])[0]
            if (!step) return null
            return <SubagentStep key={item.id} step={step} />
          }
          const row = toMessageRows([item])[0]
          if (!row || row.message.parts.length === 0) return null
          return (
            <MessageView
              key={item.id}
              row={row}
              generating={!finished && item === items.at(-1)}
              capabilities={{
                renderMarkdown: (text) => <MarkdownContent text={text} />,
                renderImage: (source, name) => (
                  <RelayImage source={source} name={name} />
                ),
              }}
            />
          )
        })}
      </div>
    </ImageGalleryProvider>
  )
}

function SubagentStep({
  step,
}: {
  step: ReturnType<typeof subagentStepRows>[number]
}) {
  return (
    <div className={`agent-subagent-step ${step.state}`}>
      <span className="agent-subagent-step-icon">
        <ToolIcon name={step.toolName} />
      </span>
      <strong>{step.toolName}</strong>
      {step.summary ? <span>{step.summary}</span> : null}
      <span className="agent-subagent-step-state" aria-hidden="true">
        {step.state === 'running' ? (
          <LoadingOrb size={15} />
        ) : step.state === 'error' ? (
          <CircleAlert size={15} />
        ) : (
          <Check size={15} />
        )}
      </span>
    </div>
  )
}
