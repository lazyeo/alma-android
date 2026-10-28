import { Maximize2, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { TabBar, type TabBarItem } from '../components/TabBar'
import { useAnimatedOverlay } from '../components/useAnimatedOverlay'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { openExternalUrl } from '../nativeBridge'
import { shouldFinishOverlayClose } from '../overlayClosing'
import type { AlmaApi } from '../relay/almaApi'
import { MarkdownContent } from './MarkdownContent'
import { fetchDesktopFile, type DesktopFile } from './localFiles'
import {
  classifyMarkdownImageSource,
  MARKDOWN_PREVIEW_LIMIT,
  resolveMarkdownPath,
} from './markdownPreview'

type PreviewTab = 'preview' | 'source'
const LOCAL_IMAGE_CONCURRENCY = 3

type ImageState =
  { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' }

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children)
  if (Array.isArray(children)) return children.map(textFromChildren).join('')
  if (children && typeof children === 'object' && 'props' in children)
    return textFromChildren(
      (children as { props?: { children?: ReactNode } }).props?.children,
    )
  return ''
}

function scrollToAnchor(container: HTMLElement | null, anchor?: string) {
  if (!container || !anchor) return
  const decoded = decodeURIComponent(anchor)
  const escaped = CSS.escape(decoded)
  container
    .querySelector<HTMLElement>(`#${escaped}`)
    ?.scrollIntoView({ block: 'start' })
}

function useLocalImageUrls(
  api: Pick<AlmaApi, 'tunnel'>,
  documentPath: string,
  sources: readonly string[],
) {
  const [states, setStates] = useState<Record<string, ImageState>>({})
  useEffect(() => {
    let disposed = false
    const urls: string[] = []
    const local = [...new Set(sources)]
      .map((src) => ({
        src,
        source: classifyMarkdownImageSource(documentPath, src),
      }))
      .filter(
        (
          entry,
        ): entry is { src: string; source: { kind: 'local'; path: string } } =>
          entry.source.kind === 'local',
      )
    setStates(
      Object.fromEntries(local.map(({ src }) => [src, { status: 'loading' }])),
    )
    let index = 0
    const worker = async () => {
      while (!disposed && index < local.length) {
        const entry = local[index++]
        try {
          const file = await fetchDesktopFile(api, entry.source.path)
          const blob = new Blob([file.bytes.slice().buffer as ArrayBuffer], {
            type: file.mimeType,
          })
          const url = URL.createObjectURL(blob)
          urls.push(url)
          if (!disposed)
            setStates((current) => ({
              ...current,
              [entry.src]: { status: 'ready', url },
            }))
        } catch {
          if (!disposed)
            setStates((current) => ({
              ...current,
              [entry.src]: { status: 'error' },
            }))
        }
      }
    }
    void Promise.all(
      Array.from(
        { length: Math.min(LOCAL_IMAGE_CONCURRENCY, local.length) },
        worker,
      ),
    )
    return () => {
      disposed = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [api, documentPath, sources])
  return states
}

function MarkdownDocument({
  text,
  file,
  api,
  onOpenFile,
  anchor,
  fullscreen = false,
}: {
  text: string
  file: DesktopFile
  api: Pick<AlmaApi, 'tunnel'>
  onOpenFile(path: string, anchor?: string): void
  anchor?: string
  fullscreen?: boolean
}) {
  const t = useT()
  const container = useRef<HTMLDivElement>(null)
  const imageSources = useMemo(
    () =>
      [...text.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+['"][^'"]*['"])?\)/g)].map(
        (match) => match[1],
      ),
    [text],
  )
  const imageStates = useLocalImageUrls(api, file.path, imageSources)

  useEffect(() => scrollToAnchor(container.current, anchor), [anchor, text])

  const heading = useCallback(
    (level: 1 | 2 | 3 | 4 | 5 | 6) =>
      function Heading({
        children,
        ...props
      }: ComponentProps<`h${typeof level}`>) {
        const Tag = `h${level}` as const
        return (
          <Tag id={slugifyHeading(textFromChildren(children))} {...props}>
            {children}
          </Tag>
        )
      },
    [],
  )

  return (
    <div
      ref={container}
      className={`markdown-file-content${fullscreen ? ' fullscreen' : ''}`}
    >
      <MarkdownContent
        text={text}
        references={false}
        renderLink={({ node: _node, href, children, ...props }) => {
          if (!href) return <span>{children}</span>
          if (/^https?:\/\//i.test(href))
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  event.preventDefault()
                  void openExternalUrl(href)
                }}
                {...props}
              >
                {children}
              </a>
            )
          const resolved = resolveMarkdownPath(file.path, href)
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!resolved) return
                if ('path' in resolved)
                  onOpenFile(resolved.path, resolved.anchor)
                else scrollToAnchor(container.current, resolved.anchor)
              }}
              {...props}
            >
              {children}
            </a>
          )
        }}
        renderImage={({ node: _node, src = '', alt = '', ...props }) => {
          const source = classifyMarkdownImageSource(file.path, src)
          if (source.kind === 'remote')
            return <img src={source.src} alt={alt} {...props} />
          const state = imageStates[src]
          if (state?.status === 'ready')
            return <img src={state.url} alt={alt} {...props} />
          if (state?.status === 'loading')
            return (
              <span className="markdown-image-placeholder">
                {alt
                  ? t('files.preview.imageLoading', { name: alt })
                  : t('files.preview.imageLoadingFallback')}
              </span>
            )
          return (
            <span className="markdown-image-placeholder">
              {alt
                ? t('files.preview.imageUnavailable', { name: alt })
                : t('files.preview.imageUnavailableFallback')}
            </span>
          )
        }}
        components={{ h1: heading(1) }}
      />
    </div>
  )
}

export function MarkdownFilePreview({
  file,
  api,
  onOpenFile,
  initialAnchor,
}: {
  file: DesktopFile
  api: Pick<AlmaApi, 'tunnel'>
  onOpenFile(path: string, anchor?: string): void
  initialAnchor?: string
}) {
  const tooLarge = file.size > MARKDOWN_PREVIEW_LIMIT
  const t = useT()
  const tabs: readonly TabBarItem<PreviewTab>[] = [
    { value: 'preview', label: t('files.preview.tabPreview') },
    { value: 'source', label: t('files.preview.tabSource') },
  ]
  const [tab, setTab] = useState<PreviewTab>(tooLarge ? 'source' : 'preview')
  const [fullscreen, setFullscreen] = useState(false)
  const text = useMemo(() => new TextDecoder().decode(file.bytes), [file])

  useEffect(() => {
    setTab(file.size > MARKDOWN_PREVIEW_LIMIT ? 'source' : 'preview')
    setFullscreen(false)
  }, [file.path, file.size])

  return (
    <div className="markdown-file-preview">
      <div className="html-preview-toolbar">
        <TabBar<PreviewTab>
          items={tabs}
          selected={tab}
          onSelect={setTab}
          label={t('files.preview.markdownView')}
          className="html-preview-tabs"
        />
        {tab === 'preview' && !tooLarge ? (
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
      {tooLarge ? (
        <p className="html-preview-note">
          {t('files.preview.markdownTooLarge')}
        </p>
      ) : null}
      {tab === 'source' ? (
        <pre className="file-link-text">{text}</pre>
      ) : fullscreen ? (
        <div className="markdown-file-content markdown-preview-placeholder" />
      ) : (
        <MarkdownDocument
          text={text}
          file={file}
          api={api}
          onOpenFile={onOpenFile}
          anchor={initialAnchor}
        />
      )}
      {fullscreen && !tooLarge ? (
        <MarkdownPreviewFullscreen
          title={file.name}
          text={text}
          file={file}
          api={api}
          onOpenFile={onOpenFile}
          anchor={initialAnchor}
          onClose={() => setFullscreen(false)}
        />
      ) : null}
    </div>
  )
}

function MarkdownPreviewFullscreen({
  title,
  text,
  file,
  api,
  onOpenFile,
  anchor,
  onClose,
}: {
  title: string
  text: string
  file: DesktopFile
  api: Pick<AlmaApi, 'tunnel'>
  onOpenFile(path: string, anchor?: string): void
  anchor?: string
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
      className={`html-preview-fullscreen markdown-preview-fullscreen${closing ? ' closing' : ''}`}
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
      <MarkdownDocument
        text={text}
        file={file}
        api={api}
        onOpenFile={onOpenFile}
        anchor={anchor}
        fullscreen
      />
    </dialog>,
    document.body,
  )
}
