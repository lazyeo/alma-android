import { Maximize2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TabBar, type TabBarItem } from '../components/TabBar'
import { useAnimatedOverlay } from '../components/useAnimatedOverlay'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { shouldFinishOverlayClose } from '../overlayClosing'
import type { AlmaApi } from '../relay/almaApi'
import {
  HTML_PREVIEW_SANDBOX,
  NATIVE_PREVIEW_SANDBOX,
  assertPreviewSandbox,
  buildPreviewSrcDoc,
} from './htmlPreview'
import type { HtmlPreviewSession } from './htmlPreviewSession'
import type { DesktopFile } from './localFiles'

type PreviewTab = 'preview' | 'source'

/** The Android isolated host; absent on the web and PWA. */
export interface HtmlPreviewSessionOpener {
  open(
    api: Pick<AlmaApi, 'tunnel'>,
    entryPath: string,
  ): Promise<HtmlPreviewSession>
}

type FrameSource =
  | { kind: 'pending' }
  | { kind: 'native'; url: string }
  | { kind: 'srcdoc'; srcDoc: string }

function PreviewFrame({
  source,
  title,
}: {
  source: Exclude<FrameSource, { kind: 'pending' }>
  title: string
}) {
  const native = source.kind === 'native'
  const sandbox = native ? NATIVE_PREVIEW_SANDBOX : HTML_PREVIEW_SANDBOX
  // A regression here would hand the document the app's origin; fail loudly.
  assertPreviewSandbox(sandbox, { isolatedHost: native })
  return (
    <iframe
      className="html-preview-frame"
      title={title}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      {...(native ? { src: source.url } : { srcDoc: source.srcDoc })}
    />
  )
}

export function HtmlFilePreview({
  file,
  api,
  sessions,
}: {
  file: DesktopFile
  api: Pick<AlmaApi, 'tunnel'>
  sessions?: HtmlPreviewSessionOpener
}) {
  const t = useT()
  const tabs: readonly TabBarItem<PreviewTab>[] = [
    { value: 'preview', label: t('files.preview.tabPreview') },
    { value: 'source', label: t('files.preview.tabSource') },
  ]
  const [tab, setTab] = useState<PreviewTab>('preview')
  const [fullscreen, setFullscreen] = useState(false)
  const html = useMemo(() => new TextDecoder().decode(file.bytes), [file])
  const srcDoc = useMemo(() => buildPreviewSrcDoc(html), [html])
  const [source, setSource] = useState<FrameSource>(
    sessions ? { kind: 'pending' } : { kind: 'srcdoc', srcDoc },
  )

  useEffect(() => {
    if (!sessions) {
      setSource({ kind: 'srcdoc', srcDoc })
      return
    }
    // The token lives exactly as long as this preview is mounted.
    let disposed = false
    let session: HtmlPreviewSession | undefined
    setSource({ kind: 'pending' })
    sessions
      .open(api, file.path)
      .then((opened) => {
        session = opened
        if (disposed) void opened.close()
        else setSource({ kind: 'native', url: opened.url })
      })
      .catch(() => {
        // Older APKs and WebViews without origin-scoped bridges still get
        // the opaque srcdoc preview.
        if (!disposed) setSource({ kind: 'srcdoc', srcDoc })
      })
    return () => {
      disposed = true
      void session?.close()
    }
  }, [api, file.path, sessions, srcDoc])

  return (
    <div className="html-preview">
      <div className="html-preview-toolbar">
        <TabBar<PreviewTab>
          items={tabs}
          selected={tab}
          onSelect={setTab}
          label={t('files.preview.htmlView')}
          className="html-preview-tabs"
        />
        {tab === 'preview' ? (
          <button
            type="button"
            className="html-preview-expand"
            aria-label={t('files.preview.fullScreen')}
            onClick={() => {
              void haptic('light')
              setFullscreen(true)
            }}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {tab === 'source' ? (
        <pre className="file-link-text">{html}</pre>
      ) : source.kind === 'pending' ? (
        <div className="file-link-state" aria-live="polite">
          <span className="file-link-spinner" />
          <span>{t('files.preview.starting')}</span>
        </div>
      ) : fullscreen ? (
        <div className="html-preview-frame html-preview-placeholder" />
      ) : (
        <PreviewFrame source={source} title={file.name} />
      )}
      {tab === 'preview' && source.kind === 'srcdoc' ? (
        <p className="html-preview-note">{t('files.preview.htmlIsolated')}</p>
      ) : null}
      {fullscreen && source.kind !== 'pending' ? (
        <HtmlPreviewFullscreen
          title={file.name}
          source={source}
          onClose={() => setFullscreen(false)}
        />
      ) : null}
    </div>
  )
}

function HtmlPreviewFullscreen({
  title,
  source,
  onClose,
}: {
  title: string
  source: Exclude<FrameSource, { kind: 'pending' }>
  onClose(): void
}) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const { closing, requestClose, finishClose } = useAnimatedOverlay(
    true,
    onClose,
  )

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal?.()
    // The sheet underneath listens on window for Escape and Tab; this
    // overlay is on top, so it consumes them first.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [requestClose])

  return createPortal(
    <dialog
      ref={dialog}
      className={`html-preview-fullscreen${closing ? ' closing' : ''}`}
      aria-label={title}
      onAnimationEnd={(event) => {
        if (
          shouldFinishOverlayClose(closing, event.target, event.currentTarget)
        )
          finishClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          autoFocus
          aria-label={t('files.preview.closeFullScreen')}
          onClick={() => {
            void haptic('light')
            requestClose()
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <PreviewFrame source={source} title={title} />
    </dialog>,
    document.body,
  )
}
