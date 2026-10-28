import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { previewKind, previewMime, previewPolicy } from './filePreview'
import { PreviewBoundary } from './PreviewBoundary'
import { useObjectUrl } from './useObjectUrl'
import { Download, ExternalLink, Share2 } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import {
  appendNativeFileChunk,
  beginNativeFile,
  finishNativeFile,
  openExternalUrl,
  saveNativeFile,
  shareNativeFile,
} from '../nativeBridge'
import { isNativePlatform } from '../nativeRuntime'
import type { AlmaApi } from '../relay/almaApi'
import { HtmlFilePreview } from './HtmlFilePreview'
import { MarkdownFilePreview } from './MarkdownFilePreview'
import { isHtmlFile } from './htmlPreview'
import { nativeHtmlPreviewSessions } from './htmlPreviewSession'
import { isMarkdownFile } from './markdownPreview'
import {
  TEXT_PREVIEW_LIMIT,
  classifyFileHref,
  fetchDesktopFile,
  fileActionErrorText,
  fileErrorPresentation,
  fileName,
  isTextPreview,
  type DesktopFile,
  type FileHref,
} from './localFiles'

const PdfFilePreview = lazy(() => import('./PdfFilePreview'))

interface FileLinkContextValue {
  handleFileLink(href: string, event?: MouseEvent<HTMLAnchorElement>): void
  /** Opens an absolute desktop path as-is (no href decoding). */
  openFile(path: string): void
}

const FileLinkContext = createContext<FileLinkContextValue>({
  handleFileLink: () => undefined,
  openFile: () => undefined,
})

export const useFileLinks = () => useContext(FileLinkContext)

interface SheetState {
  path: string
  anchor?: string
  status: 'loading' | 'ready' | 'error' | 'unresolved'
  file?: DesktopFile
  text?: string
  error?: { title: string; detail: string }
  nativeToken?: string
  preparing?: boolean
  actionMessage?: { tone: 'error' | 'success'; text: string }
}

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

export function FileLinkProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const { api } = useConnection()
  const [state, setState] = useState<SheetState>()
  const [history, setHistory] = useState<SheetState[]>([])

  const close = useCallback(() => {
    requestId.current++
    setState(undefined)
    setHistory([])
  }, [])

  const requestId = useRef(0)
  const blob = useMemo(
    () =>
      state?.file
        ? new Blob([state.file.bytes.slice().buffer as ArrayBuffer], {
            type: previewMime(state.file.name, state.file.mimeType),
          })
        : undefined,
    [state?.file],
  )
  const fileUrl = useObjectUrl(blob)
  useEffect(
    () => () => {
      requestId.current++
    },
    [],
  )

  const loadLocalFile = useCallback(
    (path: string, anchor?: string, pushHistory = false) => {
      const request = ++requestId.current
      setState((current) => {
        if (pushHistory && current) setHistory((items) => [...items, current])
        return { path, anchor, status: 'loading' }
      })
      fetchDesktopFile(api, path)
        .then((file) => {
          if (request !== requestId.current) return
          const text =
            isTextPreview(file.mimeType, file.name) &&
            file.size <= TEXT_PREVIEW_LIMIT
              ? new TextDecoder().decode(file.bytes)
              : undefined
          setState((current) =>
            current?.path === path
              ? { path, anchor, status: 'ready', file, text }
              : current,
          )
        })
        .catch((error) =>
          setState((current) =>
            request === requestId.current && current?.path === path
              ? { path, status: 'error', error: fileErrorPresentation(error) }
              : current,
          ),
        )
    },
    [api],
  )

  const openLocalFile = useCallback(
    (path: string) => loadLocalFile(path),
    [loadLocalFile],
  )
  const replaceLocalFile = useCallback(
    (path: string, anchor?: string) => loadLocalFile(path, anchor, true),
    [loadLocalFile],
  )
  const back = useCallback(() => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((items) => items.slice(0, -1))
    requestId.current++
    setState(previous)
  }, [history])

  useEffect(() => {
    const onNativeFileLink = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (path) openLocalFile(path)
    }
    window.addEventListener('almafilelink', onNativeFileLink)
    return () => window.removeEventListener('almafilelink', onNativeFileLink)
  }, [openLocalFile])

  const handleFileLink = useCallback(
    (href: string, event?: MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault()
      event?.stopPropagation()
      const classified = classifyFileHref(href)
      if (classified.kind === 'local') openLocalFile(classified.path)
      else if (classified.kind === 'unresolved-home')
        setState({
          path: classified.href,
          status: 'unresolved',
          error: {
            title: t('files.link.homeUnknown'),
            detail: t('files.link.homeUnknownDetail'),
          },
        })
      else if (classified.kind === 'external')
        void openExternalUrl(classified.href)
    },
    [openLocalFile, t],
  )

  const prepareNative = useCallback(async () => {
    if (!state?.file || !isNativePlatform()) return undefined
    if (state.nativeToken) return state.nativeToken
    setState((current) =>
      current
        ? { ...current, preparing: true, actionMessage: undefined }
        : current,
    )
    const { token } = await beginNativeFile({
      name: state.file.name,
      mimeType: state.file.mimeType,
      size: state.file.size,
    })
    const chunkSize = 256 * 1024
    for (
      let offset = 0;
      offset < state.file.bytes.length;
      offset += chunkSize
    ) {
      await appendNativeFileChunk({
        token,
        base64: toBase64(state.file.bytes.slice(offset, offset + chunkSize)),
      })
    }
    await finishNativeFile({ token })
    setState((current) =>
      current ? { ...current, nativeToken: token, preparing: false } : current,
    )
    return token
  }, [state])

  const webDownload = useCallback(() => {
    if (!fileUrl || !state?.file) return
    const anchor = document.createElement('a')
    anchor.href = fileUrl
    anchor.download = state.file.name
    anchor.rel = 'noopener'
    anchor.click()
  }, [state, fileUrl])

  const action = useCallback(
    async (kind: 'open' | 'share' | 'save') => {
      if (!state?.file) return
      if (!isNativePlatform()) {
        webDownload()
        return
      }
      try {
        const token = await prepareNative()
        if (!token) return
        if (kind === 'open') await finishNativeFile({ token, open: true })
        if (kind === 'share') await shareNativeFile({ token })
        if (kind === 'save') await saveNativeFile({ token })
        if (kind === 'save')
          setState((current) =>
            current
              ? {
                  ...current,
                  actionMessage: {
                    tone: 'success',
                    text: t('files.link.savedToDownloads'),
                  },
                }
              : current,
          )
      } catch (error) {
        // The file is already loaded, so keep the preview and explain the action failure.
        setState((current) =>
          current
            ? {
                ...current,
                preparing: false,
                actionMessage: {
                  tone: 'error',
                  text: fileActionErrorText(kind, error),
                },
              }
            : current,
        )
      }
    },
    [prepareNative, state?.file, t, webDownload],
  )

  const value = useMemo(
    () => ({ handleFileLink, openFile: openLocalFile }),
    [handleFileLink, openLocalFile],
  )
  return (
    <FileLinkContext.Provider value={value}>
      {children}
      {state ? (
        <BottomSheet
          title={fileName(state.path)}
          titleMeta={state.file ? formatBytes(state.file.size) : undefined}
          label={t('files.link.label')}
          className="file-link-sheet"
          onClose={close}
          onBack={history.length ? back : undefined}
          footer={
            state.status === 'ready' ? (
              <>
                {state.actionMessage ? (
                  <p
                    className={`file-link-action-message ${state.actionMessage.tone}`}
                    role={
                      state.actionMessage.tone === 'error' ? 'alert' : 'status'
                    }
                  >
                    {state.actionMessage.text}
                  </p>
                ) : null}
                <div className="file-link-actions">
                  <button type="button" onClick={() => void action('open')}>
                    <ExternalLink size={18} /> {t('files.link.openWith')}
                  </button>
                  <button type="button" onClick={() => void action('share')}>
                    <Share2 size={18} /> {t('files.link.share')}
                  </button>
                  <button type="button" onClick={() => void action('save')}>
                    <Download size={18} /> {t('files.link.saveToDownloads')}
                  </button>
                </div>
              </>
            ) : undefined
          }
        >
          <FileSheetBody
            state={state}
            url={fileUrl}
            api={api}
            openFile={replaceLocalFile}
            retry={() => loadLocalFile(state.path, state.anchor)}
          />
        </BottomSheet>
      ) : null}
    </FileLinkContext.Provider>
  )
}

function FileSheetBody({
  state,
  url,
  api,
  openFile,
  retry,
}: {
  state: SheetState
  url?: string
  api: Pick<AlmaApi, 'tunnel'>
  openFile: (path: string, anchor?: string) => void
  retry: () => void
}) {
  const t = useT()
  if (state.status === 'loading')
    return (
      <div className="file-link-state" aria-live="polite">
        <span className="file-link-spinner" />
        <strong>{t('files.link.loading')}</strong>
        <span>{t('files.link.loadingDetail')}</span>
      </div>
    )
  if (state.status === 'error' || state.status === 'unresolved')
    return (
      <div className="file-link-state error" aria-live="polite">
        <strong>{state.error?.title}</strong>
        <span>{state.error?.detail}</span>
        {state.status === 'error' ? (
          <button type="button" onClick={retry}>
            {t('common.tryAgain')}
          </button>
        ) : null}
      </div>
    )
  if (!state.file || !url) return null
  const policy = previewPolicy(
    state.file.name,
    state.file.mimeType,
    state.file.size,
  )
  if (policy.status === 'too-large')
    return (
      <div className="file-link-state">
        <strong>{t('files.rich.tooLarge')}</strong>
        <span>
          {t('files.rich.tooLargeDetail', { limit: formatBytes(policy.limit) })}
        </span>
      </div>
    )
  const kind = previewKind(state.file.name, state.file.mimeType)
  if (kind === 'audio')
    return (
      <audio
        className="file-link-media"
        controls
        preload="metadata"
        src={url}
        aria-label={state.file.name}
      />
    )
  if (kind === 'video')
    return (
      <video
        className="file-link-media"
        controls
        playsInline
        preload="metadata"
        src={url}
        aria-label={state.file.name}
      />
    )
  if (kind === 'svg')
    return <img className="file-link-image" src={url} alt={state.file.name} />
  if (isHtmlFile(state.file.name))
    return (
      <HtmlFilePreview
        file={state.file}
        api={api}
        sessions={nativeHtmlPreviewSessions()}
      />
    )
  if (isMarkdownFile(state.file.name, state.file.mimeType))
    return (
      <MarkdownFilePreview
        file={state.file}
        api={api}
        onOpenFile={openFile}
        initialAnchor={state.anchor}
      />
    )
  if (state.file.mimeType.startsWith('image/'))
    return <img className="file-link-image" src={url} alt={state.file.name} />
  if (kind === 'pdf')
    return (
      <PreviewBoundary
        key={state.file.path}
        fallback={<p role="status">{t('files.rich.failed')}</p>}
      >
        <Suspense fallback={<p>{t('files.link.loading')}</p>}>
          <PdfFilePreview file={state.file} />
        </Suspense>
      </PreviewBoundary>
    )
  if (state.text !== undefined)
    return <pre className="file-link-text">{state.text}</pre>
  return (
    <div className="file-link-state">
      <strong>{t('files.link.noPreview')}</strong>
      <span>{t('files.link.noPreviewDetail')}</span>
      {state.preparing ? <span>{t('files.link.preparing')}</span> : null}
    </div>
  )
}

export function FileAwareLink({
  href,
  children,
  ...props
}: {
  href?: string
  children: ReactNode
  [key: string]: unknown
}) {
  const { handleFileLink } = useFileLinks()
  const classified: FileHref | undefined = href
    ? classifyFileHref(href)
    : undefined
  if (!href) return <span>{children}</span>
  if (classified?.kind === 'external')
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => handleFileLink(href, event)}
        {...props}
      >
        {children}
      </a>
    )
  return (
    <a
      href={classified?.kind === 'relative' ? undefined : href}
      role="button"
      onClick={(event) => handleFileLink(href, event)}
      {...props}
    >
      {children}
    </a>
  )
}
