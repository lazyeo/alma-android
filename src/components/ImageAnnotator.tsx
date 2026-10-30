import {
  ArrowDownLeft,
  Brush,
  Circle,
  MousePointer2,
  Redo2,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { encodeImageCanvas } from '../screens/imageProcessing'
import { useT } from '../i18n'
import { useAnimatedOverlay } from './useAnimatedOverlay'
import {
  ANNOTATION_COLORS,
  drawRegion,
  hitTestRegion,
  normalizePoint,
  translateRegion,
  type AnnotationRegion,
  type AnnotatorTool,
  type Point,
} from './imageAnnotatorModel'

export interface ImageAnnotatorProps {
  source: Blob | string
  onDone(blob: Blob, regions: AnnotationRegion[], note: string): void
  onCancel(): void
  mode?: 'edit-request' | 'markup'
}

interface HistoryState {
  regions: AnnotationRegion[]
  selectedId?: string
}

interface PointerSample extends Point {
  startX: number
  startY: number
}

const TOOL_ICONS = {
  select: MousePointer2,
  rect: Square,
  ellipse: Circle,
  brush: Brush,
  arrow: ArrowDownLeft,
} as const

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `region-${Date.now()}-${Math.random()}`

function imageSize(image: HTMLImageElement) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  }
}

export function ImageAnnotator({
  source,
  onDone,
  onCancel,
  mode = 'edit-request',
}: ImageAnnotatorProps) {
  const t = useT()
  const overlay = useAnimatedOverlay(true, onCancel)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>()
  const sourceUrlRef = useRef<string>()
  const pointers = useRef(new Map<number, PointerSample>())
  const gesture = useRef({ distance: 0, scale: 1, center: { x: 0, y: 0 } })
  const draftStart = useRef<Point>()
  const moveStart = useRef<{ point: Point; region: AnnotationRegion }>()
  const [tool, setTool] = useState<AnnotatorTool>('rect')
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0])
  const [history, setHistory] = useState<HistoryState[]>([
    { regions: [], selectedId: undefined },
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  const state = history[historyIndex]
  const [draft, setDraft] = useState<AnnotationRegion>()
  const [note, setNote] = useState('')
  const [imageReady, setImageReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 })
  const [focusedLabel, setFocusedLabel] = useState(false)

  const selected = state.regions.find(
    (region) => region.id === state.selectedId,
  )

  const commit = useCallback(
    (next: HistoryState) => {
      setHistory((current) => [...current.slice(0, historyIndex + 1), next])
      setHistoryIndex((current) => current + 1)
    },
    [historyIndex],
  )

  useEffect(() => {
    const image = new Image()
    const url =
      typeof source === 'string' ? source : URL.createObjectURL(source)
    if (typeof source !== 'string') sourceUrlRef.current = url
    image.src = url
    image.onload = () => {
      imageRef.current = image
      setImageReady(true)
    }
    image.onerror = () => setError(t('files.annotator.loadFailed'))
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = undefined
    }
  }, [source, t])

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(bounds.width * ratio))
    canvas.height = Math.max(1, Math.round(bounds.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, bounds.width, bounds.height)
    const size = imageSize(image)
    const fit = Math.min(bounds.width / size.width, bounds.height / size.height)
    const width = size.width * fit
    const height = size.height * fit
    const left = (bounds.width - width) / 2
    const top = (bounds.height - height) / 2
    context.save()
    context.translate(
      bounds.width / 2 + viewport.x,
      bounds.height / 2 + viewport.y,
    )
    context.scale(viewport.scale, viewport.scale)
    context.translate(-bounds.width / 2, -bounds.height / 2)
    context.drawImage(image, left, top, width, height)
    for (const region of draft ? [...state.regions, draft] : state.regions)
      drawRegion(context, region, width, height, region.id === state.selectedId)
    context.restore()
    canvas.dataset.imageLeft = String(left)
    canvas.dataset.imageTop = String(top)
    canvas.dataset.imageWidth = String(width)
    canvas.dataset.imageHeight = String(height)
  }, [draft, state.regions, state.selectedId, viewport])

  useEffect(() => {
    if (!imageReady) return
    renderCanvas()
    const observer = new ResizeObserver(renderCanvas)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [imageReady, renderCanvas])

  const canvasPoint = useCallback(
    (event: ReactPointerEvent): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const bounds = canvas.getBoundingClientRect()
      const left = Number(canvas.dataset.imageLeft || 0)
      const top = Number(canvas.dataset.imageTop || 0)
      const width = Number(canvas.dataset.imageWidth || bounds.width)
      const height = Number(canvas.dataset.imageHeight || bounds.height)
      const transformedX =
        (event.clientX - bounds.left - bounds.width / 2 - viewport.x) /
          viewport.scale +
        bounds.width / 2
      const transformedY =
        (event.clientY - bounds.top - bounds.height / 2 - viewport.y) /
          viewport.scale +
        bounds.height / 2
      return normalizePoint(
        { x: transformedX - left, y: transformedY - top },
        width,
        height,
      )
    },
    [viewport],
  )

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    })
    if (pointers.current.size === 2) {
      setDraft(undefined)
      moveStart.current = undefined
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewport.scale,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      return
    }
    const point = canvasPoint(event)
    draftStart.current = point
    if (tool === 'select') {
      const match = [...state.regions]
        .reverse()
        .find((region) => hitTestRegion(region, point, 0.035 / viewport.scale))
      if (match) {
        moveStart.current = { point, region: match }
        commit({ regions: state.regions, selectedId: match.id })
      } else commit({ regions: state.regions, selectedId: undefined })
      return
    }
    setDraft({
      id: makeId(),
      index: state.regions.length + 1,
      tool,
      color,
      points: [point, point],
    })
  }

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, {
      ...previous,
      x: event.clientX,
      y: event.clientY,
    })
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      setViewport({
        scale: Math.max(
          1,
          Math.min(
            5,
            gesture.current.scale *
              (distance / Math.max(1, gesture.current.distance)),
          ),
        ),
        x: viewport.x + center.x - gesture.current.center.x,
        y: viewport.y + center.y - gesture.current.center.y,
      })
      gesture.current.center = center
      return
    }
    const point = canvasPoint(event)
    if (tool === 'select' && moveStart.current) {
      const moved = translateRegion(moveStart.current.region, {
        x: point.x - moveStart.current.point.x,
        y: point.y - moveStart.current.point.y,
      })
      setDraft(moved)
      return
    }
    if (!draft || !draftStart.current) return
    setDraft((current) =>
      current
        ? {
            ...current,
            points:
              current.tool === 'brush'
                ? [...current.points, point]
                : [draftStart.current!, point],
          }
        : current,
    )
  }

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size) return
    if (draft) {
      const nextRegions =
        tool === 'select'
          ? state.regions.map((region) =>
              region.id === draft.id ? draft : region,
            )
          : [...state.regions, draft]
      commit({ regions: nextRegions, selectedId: draft.id })
    }
    setDraft(undefined)
    draftStart.current = undefined
    moveStart.current = undefined
  }

  const updateSelected = (updates: Partial<AnnotationRegion>) => {
    if (!selected) return
    commit({
      regions: state.regions.map((region) =>
        region.id === selected.id ? { ...region, ...updates } : region,
      ),
      selectedId: selected.id,
    })
  }

  const deleteSelected = () => {
    if (!selected) return
    commit({
      regions: state.regions
        .filter((region) => region.id !== selected.id)
        .map((region, index) => ({ ...region, index: index + 1 })),
      selectedId: undefined,
    })
  }

  const flatten = useCallback(async () => {
    const image = imageRef.current
    if (!image) throw new Error(t('files.annotator.loadFailed'))
    const size = imageSize(image)
    const scale = Math.min(1, 2200 / Math.max(size.width, size.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width * scale))
    canvas.height = Math.max(1, Math.round(size.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error(t('files.annotator.exportFailed'))
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const region of state.regions)
      drawRegion(context, region, canvas.width, canvas.height)
    const preserveAlpha =
      source instanceof Blob && source.type.toLowerCase() === 'image/png'
    return encodeImageCanvas(canvas, { preserveAlpha, maxEdge: 2200 })
  }, [source, state.regions, t])

  const done = async () => {
    setSaving(true)
    setError('')
    try {
      onDone(await flatten(), state.regions, note.trim())
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('files.annotator.exportFailed'),
      )
      setSaving(false)
    }
  }

  const tools = useMemo(
    () => ['select', 'rect', 'ellipse', 'brush', 'arrow'] as const,
    [],
  )

  return createPortal(
    <section
      className={`image-annotator${overlay.closing ? ' closing' : ''}${focusedLabel ? ' input-focused' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('files.annotator.title')}
      onAnimationEnd={() => overlay.closing && overlay.finishClose()}
    >
      <header>
        <button
          className="header-icon-button"
          onClick={overlay.requestClose}
          aria-label={t('common.cancel')}
        >
          <X size={20} />
        </button>
        <h2>{t('files.annotator.title')}</h2>
        <button
          className="quiet-text-button annotator-done"
          disabled={saving || !imageReady}
          onClick={() => void done()}
        >
          {saving ? t('files.annotator.saving') : t('common.done')}
        </button>
      </header>
      <div className="annotator-canvas-wrap">
        <canvas
          ref={canvasRef}
          aria-label={t('files.annotator.canvas')}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        />
        {!imageReady && !error ? (
          <span className="annotator-status">{t('files.image.loading')}</span>
        ) : null}
      </div>
      {mode === 'edit-request' && selected ? (
        <div className="annotator-label-strip">
          <span className="annotator-region-number">{selected.index}</span>
          <input
            value={selected.label ?? ''}
            aria-label={t('files.annotator.regionLabel', {
              number: selected.index,
            })}
            placeholder={t('files.annotator.labelPlaceholder')}
            onFocus={() => setFocusedLabel(true)}
            onBlur={() => setFocusedLabel(false)}
            onChange={(event) =>
              updateSelected({ label: event.currentTarget.value })
            }
          />
        </div>
      ) : null}
      <div className="annotator-controls">
        <div
          className="annotator-tools"
          role="toolbar"
          aria-label={t('files.annotator.tools')}
        >
          {tools.map((item) => {
            const Icon = TOOL_ICONS[item]
            return (
              <button
                key={item}
                className="quiet-icon-button"
                aria-label={t(`files.annotator.tool.${item}`)}
                aria-pressed={tool === item}
                onClick={() => setTool(item)}
              >
                <Icon size={18} />
              </button>
            )
          })}
          <span className="annotator-toolbar-spacer" />
          <button
            className="quiet-icon-button"
            aria-label={t('files.annotator.undo')}
            disabled={historyIndex === 0}
            onClick={() =>
              setHistoryIndex((current) => Math.max(0, current - 1))
            }
          >
            <Undo2 size={18} />
          </button>
          <button
            className="quiet-icon-button"
            aria-label={t('files.annotator.redo')}
            disabled={historyIndex === history.length - 1}
            onClick={() =>
              setHistoryIndex((current) =>
                Math.min(history.length - 1, current + 1),
              )
            }
          >
            <Redo2 size={18} />
          </button>
          <button
            className="quiet-icon-button"
            aria-label={t('files.annotator.deleteSelected')}
            disabled={!selected}
            onClick={deleteSelected}
          >
            <Trash2 size={18} />
          </button>
          <button
            className="quiet-icon-button"
            aria-label={t('files.annotator.clear')}
            disabled={!state.regions.length}
            onClick={() => commit({ regions: [], selectedId: undefined })}
          >
            <RotateCcw size={18} />
          </button>
        </div>
        <div
          className="annotator-colors"
          aria-label={t('files.annotator.colors')}
        >
          {ANNOTATION_COLORS.map((item) => (
            <button
              key={item}
              className="annotator-color"
              style={{ '--annotation-color': item } as React.CSSProperties}
              aria-label={t('files.annotator.color', { color: item })}
              aria-pressed={color === item}
              onClick={() => {
                setColor(item)
                if (selected) updateSelected({ color: item })
              }}
            />
          ))}
        </div>
        {mode === 'edit-request' ? (
          <textarea
            value={note}
            aria-label={t('files.annotator.overallNote')}
            placeholder={t('files.annotator.notePlaceholder')}
            onFocus={() => setFocusedLabel(true)}
            onBlur={() => setFocusedLabel(false)}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        ) : null}
        {error ? <p className="annotator-error">{error}</p> : null}
      </div>
    </section>,
    document.body,
  )
}
