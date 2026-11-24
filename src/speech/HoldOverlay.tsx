import { Lock } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import type { DictationAction } from './delivery'
import { MAX_RECORDING_MS } from './dictationSession'
import {
  bubbleFrame,
  type Capsule,
  type HoldLayout,
  type HoldZone,
} from './holdLayout'

/** How many recent input levels the bubble's waveform shows. */
export const WAVE_BARS = 24
/** A locked recording warns this long before native's cap stops it. */
export const ENDING_SOON_MS = 30_000

/** A recording's length as mm:ss, the cap being well under an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, '0')
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${seconds}`
}

/** Set while a locked recording goes on without a finger. */
export interface LockedRecording {
  elapsedMs: number
  /** Shows Send; a composer without a send path only offers To text. */
  canSend: boolean
  onSend(): void
  onEdit(): void
}

/** The pressed input area, in viewport pixels, with its corner radius. */
export interface EntryFrame {
  left: number
  top: number
  width: number
  height: number
  radius: string
}

export interface HoldOverlayProps {
  layout: HoldLayout
  /** Where the finger is (or was, once released). */
  zone: HoldZone
  /** Released: waiting for the transcript, the capsules are gone. */
  finishing: boolean
  /** What letting go in the release zone does for this composer. */
  release: DictationAction
  /** The live transcript, when the engine streams one. */
  transcript: string
  /** Recent input levels, oldest first, 0–1. */
  levels: number[]
  /**
   * The input area the hold started on, drawn over itself in the accent
   * with the live waveform, so the press reads as the area turning into
   * the hold (red while the finger is on Cancel).
   */
  entry?: EntryFrame
  /** The engine at work and, after a switch, why. */
  engineLabel: string
  fallback?: string
  /** Abandons a dictation that is still being transcribed, or a locked one. */
  onCancel(): void
  locked?: LockedRecording
}

/**
 * The full-screen hold-to-talk overlay: a dimmed screen, a bubble with the
 * live waveform and transcript, the lock hint above it, and the cancel and
 * edit capsules above the arc the finger starts on. Locked, the capsules
 * give way to Cancel, To text and Send buttons in the same band. Every
 * shape comes from `layout`, the same geometry the finger is hit-tested
 * against.
 */
export function HoldOverlay(props: HoldOverlayProps) {
  return createPortal(<HoldOverlayView {...props} />, document.body)
}

export function HoldOverlayView({
  layout,
  zone,
  finishing,
  release,
  transcript,
  levels,
  entry,
  engineLabel,
  fallback,
  onCancel,
  locked,
}: HoldOverlayProps) {
  const t = useT()
  const frame = bubbleFrame(layout, zone)
  const remainingMs = locked ? MAX_RECORDING_MS - locked.elapsedMs : Infinity
  const status = finishing
    ? t('speech.sheet.transcribing')
    : locked
      ? remainingMs <= ENDING_SOON_MS
        ? t('speech.locked.endingSoon', {
            seconds: Math.max(0, Math.ceil(remainingMs / 1000)),
            minutes: MAX_RECORDING_MS / 60_000,
          })
        : t('speech.locked.status')
      : zone === 'release'
        ? t(`speech.hold.${release}`)
        : t(`speech.hold.${zone}`)
  const elapsed = locked ? formatElapsed(locked.elapsedMs) : ''
  // Offered while the finger can still slide up to it.
  const lockHint =
    !finishing && !locked && (zone === 'release' || zone === 'lock')
  const text =
    zone === 'cancel' ? '' : transcript || (zone === 'edit' ? null : '')
  return (
    <div
      className="voice-hold"
      data-zone={zone}
      data-finishing={finishing}
      role="dialog"
      aria-modal="true"
      aria-label={t('speech.sheet.title')}
    >
      <div className="voice-hold-scrim" />
      <div
        className="voice-hold-bubble"
        data-zone={zone}
        style={{
          left: frame.left,
          width: frame.width,
          bottom: layout.height - layout.bubbleBottom,
        }}
      >
        {text === null ? (
          <p className="voice-hold-text voice-hold-hint">
            {t('speech.hold.editHint')}
          </p>
        ) : text ? (
          <p className="voice-hold-text" data-full={zone === 'edit'}>
            <span>{text}</span>
          </p>
        ) : null}
        <Waveform levels={levels} />
        <span
          className="voice-hold-tail"
          style={{ left: frame.tailX - frame.left }}
        />
        {lockHint ? (
          <span className="voice-hold-lock" data-active={zone === 'lock'}>
            <Lock size={16} strokeWidth={2} aria-hidden="true" />
            {t('speech.hold.lockHint')}
          </span>
        ) : null}
      </div>
      <div
        className="voice-hold-status"
        style={{ left: frame.tailX, top: layout.bubbleBottom + 16 }}
      >
        {locked && !finishing ? (
          <span
            className="voice-hold-elapsed"
            role="timer"
            aria-label={t('speech.locked.elapsed', { time: elapsed })}
          >
            {elapsed}
          </span>
        ) : null}
        <p aria-live="polite">{status}</p>
        <small>{fallback ?? engineLabel}</small>
        {finishing ? (
          <button className="quiet-text-button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
      {locked && !finishing ? (
        <div
          className="voice-hold-actions"
          style={{
            left: layout.width / 2 - layout.band / 2,
            width: layout.band,
            top: layout.cancel.cy - layout.cancel.height / 2,
            height: layout.cancel.height,
          }}
        >
          <button type="button" onClick={onCancel}>
            {t('speech.locked.cancel')}
          </button>
          <button type="button" onClick={locked.onEdit}>
            {t('speech.locked.edit')}
          </button>
          {locked.canSend ? (
            <button type="button" className="primary" onClick={locked.onSend}>
              {t('speech.locked.send')}
            </button>
          ) : null}
        </div>
      ) : finishing ? null : (
        <>
          <CapsuleShape
            capsule={layout.cancel}
            active={zone === 'cancel'}
            label={t('speech.hold.cancelZone')}
          />
          <CapsuleShape
            capsule={layout.edit}
            active={zone === 'edit'}
            label={t('speech.hold.editZone')}
          />
        </>
      )}
      <div
        className="voice-hold-arc"
        data-active={!finishing && !locked && zone === 'release'}
        style={{
          left: layout.arc.cx - layout.arc.r,
          top: layout.arc.cy - layout.arc.r,
          width: layout.arc.r * 2,
          height: layout.arc.r * 2,
        }}
      />
      {entry ? (
        <div
          className="voice-hold-entry"
          data-zone={zone}
          style={{
            left: entry.left,
            top: entry.top,
            width: entry.width,
            height: entry.height,
            borderRadius: entry.radius,
          }}
        >
          <Waveform levels={levels} />
        </div>
      ) : null}
    </div>
  )
}

function CapsuleShape({
  capsule,
  active,
  label,
}: {
  capsule: Capsule
  active: boolean
  label: string
}) {
  return (
    <div
      className="voice-hold-capsule"
      data-active={active}
      style={{
        left: capsule.cx - capsule.width / 2,
        top: capsule.cy - capsule.height / 2,
        width: capsule.width,
        height: capsule.height,
        transform: `rotate(${capsule.angle}deg)`,
      }}
    >
      {label}
    </div>
  )
}

function Waveform({ levels }: { levels: number[] }) {
  const recent = levels.slice(-WAVE_BARS)
  const bars = [...Array<number>(WAVE_BARS - recent.length).fill(0), ...recent]
  return (
    <div className="voice-hold-wave" aria-hidden="true">
      {bars.map((level, index) => (
        <span
          key={index}
          // RMS of speech sits well below 1; the square root spreads it out.
          style={{
            height: 3 + 21 * Math.min(1, Math.sqrt(Math.max(0, level)) * 1.4),
          }}
        />
      ))}
    </div>
  )
}
