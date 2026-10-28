import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAnimatedOverlay } from '../components/useAnimatedOverlay'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import { imageCache } from './relayImages'
import {
  GALLERY_DISMISS_DISTANCE,
  GALLERY_DISMISS_VELOCITY,
  clampGalleryIndex,
  gallerySwipeTarget,
  type GalleryImage,
} from './galleryModel'

interface GalleryContextValue {
  openGallery(source: string): void
}

const GalleryContext = createContext<GalleryContextValue>({
  openGallery: () => undefined,
})

export const useImageGallery = () => useContext(GalleryContext)

interface ResolvedImage {
  url?: string
  failed?: boolean
}

const THUMBNAIL_WINDOW = 6

export function ImageGalleryProvider({
  images,
  children,
}: {
  images: readonly GalleryImage[]
  children: ReactNode
}) {
  const { api } = useConnection()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [chrome, setChrome] = useState(true)
  const [resolved, setResolved] = useState<Record<string, ResolvedImage>>({})
  const resolvedRef = useRef(resolved)
  const createdUrls = useRef(new Set<string>())
  resolvedRef.current = resolved
  const overlay = useAnimatedOverlay(open, () => setOpen(false))
  const stripRef = useRef<HTMLDivElement>(null)

  const resolve = useCallback(
    (source: string) => {
      if (resolvedRef.current[source]) return
      setResolved((current) => ({ ...current, [source]: {} }))
      imageCache(api)
        .get(source)
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          createdUrls.current.add(url)
          setResolved((current) => ({ ...current, [source]: { url } }))
        })
        .catch(() =>
          setResolved((current) => ({
            ...current,
            [source]: { failed: true },
          })),
        )
    },
    [api],
  )

  useEffect(
    () => () => {
      for (const url of createdUrls.current) URL.revokeObjectURL(url)
      createdUrls.current.clear()
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    // Slides need ±1; the wider window fills the thumbnails around the
    // current one. Blobs come from the cache the inline images share.
    for (
      let offset = -THUMBNAIL_WINDOW;
      offset <= THUMBNAIL_WINDOW;
      offset += 1
    ) {
      const image = images[index + offset]
      if (image) resolve(image.source)
    }
  }, [images, index, open, resolve])

  useEffect(() => {
    if (!open) return
    const element = stripRef.current?.children[index] as HTMLElement | undefined
    element?.scrollIntoView?.({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [index, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') overlay.requestClose()
      if (event.key === 'ArrowLeft')
        setIndex((current) => clampGalleryIndex(current - 1, images.length))
      if (event.key === 'ArrowRight')
        setIndex((current) => clampGalleryIndex(current + 1, images.length))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [images.length, open, overlay.requestClose])

  const openGallery = useCallback(
    (source: string) => {
      const next = images.findIndex((image) => image.source === source)
      if (next < 0) return
      setIndex(next)
      setChrome(true)
      setOpen(true)
    },
    [images],
  )

  const value = useMemo(() => ({ openGallery }), [openGallery])

  return (
    <GalleryContext.Provider value={value}>
      {children}
      {overlay.rendered && images[index]
        ? createPortal(
            <GalleryViewer
              images={images}
              index={index}
              setIndex={setIndex}
              resolved={resolved}
              resolve={resolve}
              chrome={chrome}
              setChrome={setChrome}
              closing={overlay.closing}
              requestClose={overlay.requestClose}
              finishClose={overlay.finishClose}
              stripRef={stripRef}
            />,
            document.body,
          )
        : null}
    </GalleryContext.Provider>
  )
}

function GalleryViewer({
  images,
  index,
  setIndex,
  resolved,
  resolve,
  chrome,
  setChrome,
  closing,
  requestClose,
  finishClose,
  stripRef,
}: {
  images: readonly GalleryImage[]
  index: number
  setIndex: (index: number | ((current: number) => number)) => void
  resolved: Record<string, ResolvedImage>
  resolve: (source: string) => void
  chrome: boolean
  setChrome: (show: boolean) => void
  closing: boolean
  requestClose: () => void
  finishClose: () => void
  stripRef: React.RefObject<HTMLDivElement>
}) {
  const t = useT()
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ x: 0, y: 0, time: 0, distance: 0, zoom: 1 })
  const lastTap = useRef(0)
  const dragged = useRef(false)

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setDrag({ x: 0, y: 0 })
  }, [index])

  const pointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragged.current = false
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointers.current.size === 1)
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        distance: 0,
        zoom,
      }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y)
      gesture.current.zoom = zoom
    }
  }

  const pointerMove = (event: ReactPointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.current.distance)
        setZoom(
          Math.max(
            1,
            Math.min(
              4,
              gesture.current.zoom * (distance / gesture.current.distance),
            ),
          ),
        )
      return
    }
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    if (
      Math.abs(event.clientX - gesture.current.x) +
        Math.abs(event.clientY - gesture.current.y) >
      8
    )
      dragged.current = true
    if (zoom > 1)
      setPan((current) => ({ x: current.x + dx, y: current.y + dy }))
    else
      setDrag({
        x: event.clientX - gesture.current.x,
        y: event.clientY - gesture.current.y,
      })
  }

  const pointerUp = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size) return
    const elapsed = Math.max(1, performance.now() - gesture.current.time)
    const velocityX = drag.x / elapsed
    const velocityY = drag.y / elapsed
    if (
      zoom === 1 &&
      drag.y > Math.abs(drag.x) &&
      (drag.y >= GALLERY_DISMISS_DISTANCE ||
        velocityY >= GALLERY_DISMISS_VELOCITY)
    )
      requestClose()
    else if (zoom === 1)
      setIndex(
        gallerySwipeTarget(
          index,
          drag.x,
          velocityX,
          images.length,
          window.innerWidth,
        ),
      )
    setDrag({ x: 0, y: 0 })
  }

  const current = images[index]
  const state = resolved[current.source]
  const dismissProgress =
    zoom === 1 && drag.y > 0 ? Math.min(0.55, drag.y / 500) : 0

  return (
    <div
      className={`image-viewer${closing ? ' closing' : ''}${chrome ? '' : ' chrome-hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('files.image.gallery')}
      style={{ backgroundColor: `rgba(5, 7, 9, ${0.96 - dismissProgress})` }}
      onAnimationEnd={() => closing && finishClose()}
      onClick={(event) =>
        event.target === event.currentTarget && requestClose()
      }
    >
      <div className="gallery-topbar">
        <button
          className="gallery-close"
          aria-label={t('files.image.closeGallery')}
          onClick={requestClose}
        >
          <X size={20} />
        </button>
        <span className="gallery-counter">
          {index + 1} / {images.length}
        </span>
      </div>
      <div
        className="gallery-stage"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <div
          className="gallery-track"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${zoom === 1 ? drag.x : 0}px), ${zoom === 1 ? Math.max(0, drag.y) : 0}px, 0)`,
          }}
        >
          {images.map((image, itemIndex) => {
            const imageState = resolved[image.source]
            return (
              <div
                className="gallery-slide"
                key={`${image.source}-${itemIndex}`}
                // The slide covers the backdrop; a tap beside the image closes.
                onClick={(event) => {
                  if (event.target === event.currentTarget && !dragged.current)
                    requestClose()
                }}
              >
                {Math.abs(itemIndex - index) <= 1 ? (
                  imageState?.url ? (
                    <img
                      src={imageState.url}
                      alt={image.name}
                      draggable={false}
                      style={
                        itemIndex === index
                          ? {
                              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                            }
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        if (dragged.current) return
                        const now = performance.now()
                        if (now - lastTap.current < 300) {
                          setZoom((currentZoom) => (currentZoom > 1 ? 1 : 2.25))
                          setPan({ x: 0, y: 0 })
                        } else setChrome(!chrome)
                        lastTap.current = now
                      }}
                    />
                  ) : (
                    <div className="gallery-status" role="status">
                      {imageState?.failed
                        ? t('files.image.unavailable')
                        : t('files.image.loading')}
                    </div>
                  )
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <div className="gallery-thumbnails" ref={stripRef}>
        {images.map((image, itemIndex) => {
          const thumbnail = resolved[image.source]
          return (
            <button
              key={`${image.source}-${itemIndex}`}
              className={itemIndex === index ? 'active' : ''}
              aria-label={t('files.image.view', { name: image.name })}
              aria-current={itemIndex === index ? 'true' : undefined}
              onFocus={() => resolve(image.source)}
              onPointerEnter={() => resolve(image.source)}
              onClick={() => setIndex(itemIndex)}
            >
              {thumbnail?.url ? <img src={thumbnail.url} alt="" /> : <span />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
