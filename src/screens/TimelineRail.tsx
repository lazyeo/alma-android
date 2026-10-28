import { useEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../haptics'
import {
  layoutTimeline,
  markerAtOffset,
  type TimelineEntry,
  type TimelineMarker,
} from './timelineLayout'
import { useT } from '../i18n'

const MARKER_MIN_GAP_PX = 12

/** Compact right-edge conversation map with content-weighted ticks. */
export function TimelineRail({
  entries,
  rowCount,
  activeIndex,
  onJump,
}: {
  entries: TimelineEntry[]
  rowCount: number
  activeIndex?: number
  onJump: (index: number) => void
}) {
  const t = useT()
  const railRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [preview, setPreview] = useState<TimelineMarker>()
  const [focusY, setFocusY] = useState<number>()

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    )
    observer.observe(rail)
    return () => observer.disconnect()
  }, [])

  const markers = useMemo(
    () => layoutTimeline(entries, rowCount, height, MARKER_MIN_GAP_PX, focusY),
    [entries, rowCount, height, focusY],
  )
  const active = useMemo(() => {
    if (activeIndex === undefined) return undefined
    let current: TimelineMarker | undefined
    for (const marker of markers)
      if (marker.index <= activeIndex) current = marker
    return current
  }, [markers, activeIndex])

  const markerAt = (clientY: number) => {
    const rect = railRef.current?.getBoundingClientRect()
    return rect ? markerAtOffset(markers, clientY - rect.top) : undefined
  }
  const updatePreview = (clientY: number) => {
    const rect = railRef.current?.getBoundingClientRect()
    if (!rect) return
    const nextFocus = Math.max(0, Math.min(rect.height, clientY - rect.top))
    setFocusY(nextFocus)
    const next = markerAt(clientY)
    if (next?.id !== preview?.id) {
      setPreview(next)
      if (next) void haptic('selection')
    }
  }
  const finish = () => {
    if (preview) onJump(preview.index)
    setPreview(undefined)
    setFocusY(undefined)
  }

  return (
    <div
      className={`timeline-rail${preview ? ' dragging' : ''}`}
      ref={railRef}
      aria-label={t('message.timeline.label')}
      role="navigation"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        updatePreview(event.clientY)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        updatePreview(event.clientY)
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        setPreview(undefined)
        setFocusY(undefined)
      }}
    >
      {markers.map((marker) => {
        const nearActive = active && Math.abs(marker.index - active.index) <= 2
        return (
          <button
            key={marker.id}
            className={`timeline-marker ${marker.kind}${
              marker.id === active?.id ? ' active' : ''
            }${nearActive ? ' near-active' : ''}${
              marker.id === preview?.id ? ' previewing' : ''
            }`}
            style={{
              top: marker.top,
              width: marker.width,
              transform: `translateY(-50%) scale(${marker.scale})`,
            }}
            aria-label={t(
              marker.kind === 'user'
                ? 'message.timeline.jumpToUser'
                : 'message.timeline.jumpToReply',
              { preview: marker.preview || t('message.attachment') },
            )}
            onClick={(event) => {
              if (event.detail === 0) onJump(marker.index)
            }}
          />
        )
      })}
      {preview ? (
        <div
          className={`timeline-preview ${preview.kind}`}
          style={{ top: preview.top }}
          aria-hidden="true"
        >
          <small>
            {preview.kind === 'user' ? t('message.timeline.you') : 'Alma'}
          </small>
          <span>{preview.preview || t('message.attachment')}</span>
        </div>
      ) : null}
    </div>
  )
}
