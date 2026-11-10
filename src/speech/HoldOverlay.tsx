import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import type { DictationAction } from './delivery'
import {
  bubbleFrame,
  type Capsule,
  type HoldLayout,
  type HoldZone,
} from './holdLayout'

/** How many recent input levels the bubble's waveform shows. */
export const WAVE_BARS = 24

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
  /** The engine at work and, after a switch, why. */
  engineLabel: string
  fallback?: string
  /** Abandons a dictation that is still being transcribed. */
  onCancel(): void
}

/**
 * The full-screen hold-to-talk overlay: a dimmed screen, a bubble with the
 * live waveform and transcript, and the cancel and edit capsules above the
 * arc the finger starts on. Every shape comes from `layout`, the same
 * geometry the finger is hit-tested against.
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
  engineLabel,
  fallback,
  onCancel,
}: HoldOverlayProps) {
  const t = useT()
  const frame = bubbleFrame(layout, zone)
  const status = finishing
    ? t('speech.sheet.transcribing')
    : zone === 'release'
      ? t(`speech.hold.${release}`)
      : t(`speech.hold.${zone}`)
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
      </div>
      <div
        className="voice-hold-status"
        style={{ left: frame.tailX, top: layout.bubbleBottom + 16 }}
      >
        <p aria-live="polite">{status}</p>
        <small>{fallback ?? engineLabel}</small>
        {finishing ? (
          <button className="quiet-text-button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
      {finishing ? null : (
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
        data-active={!finishing && zone === 'release'}
        style={{
          left: layout.arc.cx - layout.arc.r,
          top: layout.arc.cy - layout.arc.r,
          width: layout.arc.r * 2,
          height: layout.arc.r * 2,
        }}
      />
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
