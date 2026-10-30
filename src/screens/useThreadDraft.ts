import { useEffect, useState } from 'react'
import type { ComposerAttachment } from './attachmentUpload'
import { createDraftAutosave, type DraftAutosave } from './threadDrafts'

/**
 * Per desktop+thread composer draft. The owning screen is remounted per
 * thread, so the autosaver is created once and flushed whenever the page may
 * disappear (unmount, backgrounding, or a WebView/page teardown).
 */
export interface ThreadDraftState extends DraftAutosave {
  attachments: ComposerAttachment[]
}

export function useThreadDraft(
  desktopId: string,
  threadId: string,
): ThreadDraftState {
  const [autosave] = useState(() =>
    createDraftAutosave(window.localStorage, desktopId, threadId),
  )
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])

  useEffect(() => {
    let active = true
    void autosave.restoreAttachments().then((restored) => {
      if (active) setAttachments(restored)
    })
    return () => {
      active = false
    }
  }, [autosave])

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') autosave.flush()
    }
    document.addEventListener('visibilitychange', flushWhenHidden)
    window.addEventListener('pagehide', autosave.flush)
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      window.removeEventListener('pagehide', autosave.flush)
      autosave.flush()
    }
  }, [autosave])

  return { ...autosave, attachments }
}
