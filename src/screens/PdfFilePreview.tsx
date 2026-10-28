import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { LocalPdfDataFactory } from './pdfAssets'
import { useT } from '../i18n'
import type { DesktopFile } from './localFiles'

export default function PdfFilePreview({ file }: { file: DesktopFile }) {
  const t = useT()
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(320)
  const scroll = useRef<HTMLDivElement>(null)
  const pinch = useRef<{ distance: number; zoom: number }>()
  useEffect(() => {
    let cancelled = false
    let destroy: (() => void) | undefined
    setFailed(false)
    setPdf(undefined)
    void Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
      .then(([lib, worker]) => {
        if (cancelled) return
        lib.GlobalWorkerOptions.workerSrc = worker.default
        const task = lib.getDocument({
          data: file.bytes.slice(),
          BinaryDataFactory: LocalPdfDataFactory,
          useWorkerFetch: false,
          maxImageSize: 16_000_000,
          canvasMaxAreaInBytes: 32_000_000,
          useSystemFonts: true,
          useWasm: true,
        })
        destroy = () => {
          void task.destroy()
        }
        return task.promise.then((doc) => {
          if (!cancelled) setPdf(doc)
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      destroy?.()
    }
  }, [file])
  useEffect(() => {
    const element = scroll.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(100, element.clientWidth - 24)),
    )
    observer.observe(element)
    setWidth(Math.max(100, element.clientWidth - 24))
    return () => observer.disconnect()
  }, [])
  const virtual = useVirtualizer({
    count: pdf?.numPages ?? 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => width * zoom * 1.414 + 16,
    overscan: 1,
  })
  useEffect(() => {
    virtual.measure()
  }, [width, zoom, virtual])
  const pages = virtual.getVirtualItems()
  const page =
    (pages.find((item) => item.end > (virtual.scrollOffset ?? 0) + 8)?.index ??
      0) + 1
  const updateZoom = (value: number) =>
    setZoom(Math.max(0.5, Math.min(3, value)))
  return (
    <div className="pdf-preview">
      <div className="preview-toolbar">
        <button
          type="button"
          aria-label={t('files.rich.zoomOut')}
          disabled={zoom <= 0.5}
          onClick={() => updateZoom(zoom - 0.25)}
        >
          −
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          {t('files.rich.fitWidth')}
        </button>
        <button
          type="button"
          aria-label={t('files.rich.zoomIn')}
          disabled={zoom >= 3}
          onClick={() => updateZoom(zoom + 0.25)}
        >
          +
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        {pdf && (
          <span aria-live="polite">
            {t('files.rich.page', { page, total: pdf.numPages })}
          </span>
        )}
      </div>
      {failed && <p role="status">{t('files.rich.failed')}</p>}
      {!pdf && !failed && <p role="status">{t('files.link.loading')}</p>}
      <div
        className="pdf-scroll"
        ref={scroll}
        onTouchStart={(event) => {
          if (event.touches.length === 2)
            pinch.current = {
              distance: Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY,
              ),
              zoom,
            }
        }}
        onTouchMove={(event) => {
          if (pinch.current && event.touches.length === 2) {
            const distance = Math.hypot(
              event.touches[0].clientX - event.touches[1].clientX,
              event.touches[0].clientY - event.touches[1].clientY,
            )
            if (pinch.current.distance)
              updateZoom(
                (pinch.current.zoom * distance) / pinch.current.distance,
              )
          }
        }}
        onTouchEnd={() => {
          pinch.current = undefined
        }}
      >
        <div
          style={{
            height: virtual.getTotalSize(),
            width: Math.max(width, width * zoom),
            position: 'relative',
          }}
        >
          {pdf &&
            pages.map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtual.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <PdfPage
                  pdf={pdf}
                  number={item.index + 1}
                  width={width * zoom}
                />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function PdfPage({
  pdf,
  number,
  width,
}: {
  pdf: PDFDocumentProxy
  number: number
  width: number
}) {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(width * 1.414)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let task: RenderTask | undefined
    const canvas = document.createElement('canvas')
    const element = host.current!
    element.replaceChildren(canvas)
    setFailed(false)
    void pdf
      .getPage(number)
      .then(async (page) => {
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: width / base.width })
        // Bound canvas memory on high-DPI devices and oversized pages.
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
        )
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio))
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio))
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        setHeight(viewport.height)
        task = page.render({
          canvas,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        })
        await task.promise
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      task?.cancel()
      canvas.remove()
      canvas.width = 0
      canvas.height = 0
    }
  }, [pdf, number, width])
  return (
    <div
      className="pdf-page"
      style={{ minHeight: height + 16 }}
      role="img"
      aria-label={t('files.rich.page', { page: number, total: pdf.numPages })}
    >
      <div ref={host} />
      {failed && <p role="status">{t('files.rich.failed')}</p>}
    </div>
  )
}
