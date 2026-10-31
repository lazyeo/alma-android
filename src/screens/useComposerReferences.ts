import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { AlmaApi, Thread } from '../relay'
import { useRefKinds, useRefResults, type RefPickItem } from './RefPicker'
import { detectRefTrigger, type RefTrigger } from './refTrigger'
import {
  deleteReferenceAtCaret,
  insertReference,
  isReferenceTokenAt,
  materializeReferences,
  parseMaterializedReferences,
  pruneReferences,
  type DraftReference,
} from './references'

export interface ComposerReferenceScope {
  threadId?: string
  workspaceId?: string
  threads?: Thread[]
}

export function useComposerReferences({
  api,
  initialContent,
  textareaRef,
  scopeKey,
  threadId,
  workspaceId,
  threads,
}: {
  api: AlmaApi
  initialContent: string
  textareaRef: RefObject<HTMLTextAreaElement>
  /** Changes when the textarea remounts, such as expanded composer mode. */
  scopeKey?: unknown
} & ComposerReferenceScope) {
  const initial = useRef(parseMaterializedReferences(initialContent))
  const [text, setText] = useState(initial.current.text)
  const [references, setReferences] = useState<DraftReference[]>(
    initial.current.references,
  )
  const [trigger, setTrigger] = useState<RefTrigger>()
  const [chipKind, setChipKind] = useState<string>()
  const composingRef = useRef(false)
  const kinds = useRefKinds(api)
  const results = useRefResults(api, trigger, chipKind, {
    threadId,
    workspaceId,
    threads,
  })
  const stateRef = useRef({ text, references })
  stateRef.current = { text, references }

  const placeCaret = useCallback(
    (caret: number) => {
      requestAnimationFrame(() => {
        const area = textareaRef.current
        area?.focus()
        area?.setSelectionRange(caret, caret)
      })
    },
    [textareaRef],
  )

  const close = useCallback(() => setTrigger(undefined), [])

  const detect = useCallback(
    (value: string, caret: number) => {
      const next =
        composingRef.current || !kinds?.length
          ? undefined
          : detectRefTrigger(value, caret, kinds)
      setTrigger(
        next &&
          !isReferenceTokenAt(value, next.start, stateRef.current.references)
          ? next
          : undefined,
      )
    },
    [kinds],
  )

  const changeText = useCallback(
    (value: string, caret?: number, isComposing = false) => {
      setText(value)
      setReferences((current) => pruneReferences(value, current))
      if (!isComposing && caret !== undefined) detect(value, caret)
    },
    [detect],
  )

  const restore = useCallback((content: string) => {
    const parsed = parseMaterializedReferences(content)
    setText(parsed.text)
    setReferences(parsed.references)
    setTrigger(undefined)
  }, [])

  const appendText = useCallback(
    (value: string) => {
      const current = stateRef.current
      const nextText = current.text ? `${current.text}\n\n${value}` : value
      setText(nextText)
      setReferences(current.references)
      setTrigger(undefined)
      placeCaret(nextText.length)
    },
    [placeCaret],
  )

  const pick = useCallback(
    (item: RefPickItem) => {
      if (!trigger) return
      const current = stateRef.current
      const next = insertReference(
        current.text,
        trigger.start,
        trigger.end,
        item,
        current.references,
      )
      setText(next.text)
      setReferences(next.references)
      setTrigger(undefined)
      setChipKind(undefined)
      placeCaret(next.caret)
    },
    [placeCaret, trigger],
  )

  useEffect(() => {
    const area = textareaRef.current
    if (!area) return
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'deleteContentBackward' || event.isComposing)
        return
      if (area.selectionStart !== area.selectionEnd) return
      const current = stateRef.current
      const next = deleteReferenceAtCaret(
        current.text,
        area.selectionStart,
        current.references,
      )
      if (!next) return
      event.preventDefault()
      setText(next.text)
      setReferences(next.references)
      setTrigger(undefined)
      placeCaret(next.caret)
    }
    area.addEventListener('beforeinput', onBeforeInput)
    return () => area.removeEventListener('beforeinput', onBeforeInput)
  }, [placeCaret, scopeKey, textareaRef])

  return {
    text,
    setText,
    references,
    setReferences,
    trigger,
    kinds,
    chipKind,
    setChipKind,
    results,
    composingRef,
    stateRef,
    content: () => materializeReferences(text, references),
    changeText,
    detect,
    pick,
    close,
    restore,
    appendText,
    placeCaret,
  }
}
