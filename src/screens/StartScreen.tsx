import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Composer } from '../components/Composer'
import {
  ComposerAttachments,
  ComposerAttachmentTray,
} from '../components/ComposerAttachments'
import {
  ComposerGoal,
  type ComposerGoalState,
} from '../components/ComposerGoal'
import { useConnection } from '../desktops/DesktopContext'
import { desktopThreadPath, desktopThreadsPath } from '../desktopRoutes'
import type { AlmaModel, Workspace, ReasoningEffort } from '../relay'
import { useLayoutMode } from '../layout/useLayoutMode'
import { normalizeEffortForModel } from './modelOptions'
import {
  createNewConversation,
  loadNewConversationDefaults,
} from './newConversation'
import type { ComposerAttachment } from './attachmentUpload'
import type { ThreadGoal } from './threadGoal'
import type { ThreadLoop } from './threadLoop'
import { parseLoopPrompt } from './threadLoop'
import { RefPicker } from './RefPicker'
import { highlightSegments } from './references'
import { useComposerReferences } from './useComposerReferences'
import { useThreadDraft } from './useThreadDraft'
import { useT } from '../i18n'

export function StartScreen() {
  const { pairing } = useConnection()
  return <StartView key={pairing.id} />
}

function StartView() {
  const t = useT()
  const { api, pairing, status } = useConnection()
  const navigate = useNavigate()
  const location = useLocation()
  const mode = useLayoutMode()
  const draft = useThreadDraft(pairing.id, '__start__')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [models, setModels] = useState<AlmaModel[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<ReasoningEffort | 'off'>('medium')
  const [fastMode, setFastMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(
    draft.attachments,
  )
  useEffect(() => {
    if (draft.attachments.length) setAttachments(draft.attachments)
  }, [draft.attachments])
  const [goal, setGoal] = useState<ThreadGoal | null>(null)
  const [loop, setLoop] = useState<ThreadLoop | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const references = useComposerReferences({
    api,
    initialContent: draft.savedText(),
    textareaRef: textarea,
    workspaceId,
  })
  const prompt = references.text
  useEffect(
    () => draft.update(references.content(), attachments),
    [draft, prompt, references.references, attachments],
  )
  const created = useRef<string>()
  const selected = models.find((candidate) => candidate.id === model)
  useEffect(() => {
    let active = true
    setSuggestions([])
    api
      .getStartSuggestions()
      .then((value) => active && setSuggestions(value))
      .catch(() => {})
    const project = new URLSearchParams(location.search).get('project')
    loadNewConversationDefaults(api, project ?? undefined)
      .then((defaults) => {
        if (!active) return
        setWorkspaces(defaults.workspaces)
        setModels(defaults.models)
        setWorkspaceId(defaults.workspaceId)
        setModel(defaults.model)
        setEffort(defaults.effort)
        setFastMode(defaults.fastMode)
      })
      .catch(() => active && setError(t('composer.start.optionsFailed')))
    return () => {
      active = false
    }
  }, [api, location.search])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
    },
    [],
  )
  const pendingGoal: ComposerGoalState = {
    goal,
    loop,
    async onSave(condition) {
      setGoal({
        condition: condition.trim(),
        setAt: Date.now(),
        turnsEvaluated: 0,
      })
    },
    async onPause(paused) {
      setGoal((current) =>
        current
          ? {
              ...current,
              ...(paused ? { pausedAt: Date.now() } : { pausedAt: undefined }),
            }
          : current,
      )
    },
    async onClear() {
      setGoal(null)
    },
    async onStartLoop(value) {
      const parsed = parseLoopPrompt(value)
      setLoop({
        prompt: value.trim(),
        intervalMs: parsed.intervalMs ?? 300_000,
        startedAt: Date.now(),
        iterations: 0,
      })
    },
    async onStopLoop() {
      setLoop((current) =>
        current ? { ...current, stoppedAt: Date.now() } : null,
      )
    },
  }
  const start = async () => {
    if (
      busy ||
      status !== 'online' ||
      !model ||
      (!prompt.trim() && !attachments.length && !goal && !loop)
    )
      return
    setBusy(true)
    setError('')
    try {
      const id =
        created.current ||
        (await createNewConversation(api, {
          models,
          workspaceId,
          model,
          effort,
          fastMode,
        }))
      created.current = id
      // ThreadScreen takes ownership of pending object URLs through navigation state.
      attachmentsRef.current = []
      navigate(desktopThreadPath(pairing.id, id), {
        replace: true,
        state: {
          navigationMotion: 'shared-composer',
          pendingFirstSend:
            prompt.trim() || attachments.length
              ? {
                  id: crypto.randomUUID(),
                  content: references.content(),
                  attachments,
                  createdAt: Date.now(),
                }
              : undefined,
          pendingGoal: goal ?? undefined,
          pendingLoop: loop ?? undefined,
        },
      })
    } catch {
      setError(t('composer.start.startFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="split-start">
      {mode === 'single' && new URLSearchParams(location.search).has('new') ? (
        <button
          className="header-icon-button start-back"
          aria-label={t('composer.start.back')}
          onClick={() => navigate(desktopThreadsPath(pairing.id))}
        >
          <ArrowLeft size={20} />
        </button>
      ) : null}
      <section className="split-start-hero">
        <img
          className="start-launcher"
          src="/icon-192.png"
          alt="Alma"
          width={56}
          height={56}
        />
        <h1>{t('composer.start.title')}</h1>
        <p>{t('composer.start.lede')}</p>
        <div className="split-start-composer composer-stack shared-composer">
          {goal || (loop && !loop.stoppedAt) ? (
            <ComposerGoal state={pendingGoal} variant="strip" />
          ) : null}
          {references.trigger && references.kinds?.length ? (
            <RefPicker
              kinds={references.kinds}
              trigger={references.trigger}
              chipKind={references.chipKind}
              onChipKind={references.setChipKind}
              {...references.results}
              onPick={references.pick}
              onClose={references.close}
            />
          ) : null}
          <Composer
            value={prompt}
            onChange={(value, target, isComposing) =>
              references.changeText(value, target.selectionStart, isComposing)
            }
            onSend={() => void start()}
            placeholder={t('composer.start.placeholder')}
            model={model}
            models={models}
            onModelChange={setModel}
            effort={normalizeEffortForModel(selected, effort)}
            onEffortChange={setEffort}
            fastMode={fastMode}
            onFastModeChange={() => setFastMode((value) => !value)}
            attachmentTray={
              <ComposerAttachmentTray
                api={api}
                attachments={attachments}
                onChange={setAttachments}
                onAnnotationText={references.appendText}
              />
            }
            attachmentControl={
              <ComposerAttachments
                attachments={attachments}
                onChange={setAttachments}
                onError={setError}
                goalControl={
                  <ComposerGoal state={pendingGoal} variant="sheet-row" />
                }
                vision={selected?.capabilities.vision !== false}
              />
            }
            projectId={workspaceId}
            projects={workspaces}
            onProjectChange={setWorkspaceId}
            disabled={
              busy ||
              status !== 'online' ||
              !model ||
              (!prompt.trim() && !attachments.length && !goal && !loop)
            }
            sending={busy}
            textareaRef={textarea}
            inputBackdrop={
              references.references.length ? (
                <div className="composer-highlight" aria-hidden="true">
                  {highlightSegments(prompt, references.references).map(
                    (segment, index) =>
                      segment.ref ? (
                        <mark key={index}>{segment.text}</mark>
                      ) : (
                        <span key={index}>{segment.text}</span>
                      ),
                  )}
                  {'\n'}
                </div>
              ) : null
            }
            textareaProps={{
              enterKeyHint: 'enter',
              onSelect: (event) =>
                references.detect(
                  event.currentTarget.value,
                  event.currentTarget.selectionStart,
                ),
              onCompositionStart: () => {
                references.composingRef.current = true
              },
              onCompositionEnd: (event) => {
                references.composingRef.current = false
                references.detect(
                  event.currentTarget.value,
                  event.currentTarget.selectionStart,
                )
              },
            }}
            onTextareaKeyDown={(event) => {
              if (references.trigger && !event.nativeEvent.isComposing) {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  references.close()
                  return true
                }
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  references.results.items[0]
                ) {
                  event.preventDefault()
                  references.pick(references.results.items[0])
                  return true
                }
              }
              return false
            }}
          />
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="start-suggestions">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => {
                references.restore(suggestion)
                textarea.current?.focus()
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
