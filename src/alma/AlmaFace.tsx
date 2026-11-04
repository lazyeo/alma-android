import { useEffect, useId, useState } from 'react'
import {
  BLINK_MS,
  fallbackMood,
  nextBlinkDelay,
  type FaceActivity,
  type FaceMood,
  type FallbackMood,
} from './faceState'
import { useReducedMotion } from './useReducedMotion'

const LEFT_EYE = { x: 25, y: 38 }
const RIGHT_EYE = { x: 39, y: 38 }
const LENS_R = 7

/** Random 4–7 s blinks; off when idle animation is off. */
function useBlink(enabled: boolean) {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setClosed(false)
      return
    }
    let timer: number
    const schedule = () => {
      timer = window.setTimeout(() => {
        setClosed(true)
        timer = window.setTimeout(() => {
          setClosed(false)
          schedule()
        }, BLINK_MS)
      }, nextBlinkDelay())
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [enabled])
  return closed
}

function Eye({
  x,
  y,
  mood,
  clipId,
}: {
  x: number
  y: number
  mood: FallbackMood
  clipId: string
}) {
  if (mood === 'happy')
    // Upturned arcs: the classic closed, smiling eyes.
    return (
      <path
        className="alma-face-line"
        d={`M${x - 4} ${y + 1} Q${x} ${y - 3.5} ${x + 4} ${y + 1}`}
      />
    )
  return (
    <g clipPath={`url(#${clipId})`}>
      <g className="alma-face-iris">
        <circle className="alma-face-eye" cx={x} cy={y} r={4.4} />
        <circle className="alma-face-pupil" cx={x} cy={y + 0.4} r={2} />
        <circle
          className="alma-face-catchlight"
          cx={x - 1.3}
          cy={y - 1.5}
          r={1}
        />
      </g>
      {/* The lid drops from the top of the lens: blink, tired, sleepy. */}
      <rect
        className="alma-face-lid"
        x={x - LENS_R}
        y={y - LENS_R}
        width={LENS_R * 2}
        height={LENS_R * 2}
      />
    </g>
  )
}

const MOUTHS: Record<FallbackMood, string> = {
  neutral: 'M30 48.5 Q32 49.6 34 48.5',
  happy: 'M28.5 47.5 Q32 51.5 35.5 47.5',
  tired: 'M30 49 L34 49',
  'sleepy-night': 'M31 48.6 Q32 50.4 33 48.6 Q32 47.6 31 48.6',
  focused: 'M30.2 48.8 L33.8 48.8',
}

/**
 * Our glasses character drawn as a tiny vector face: bob hair, two round
 * lenses, green eyes behind them, and a small mouth. CSS owns every
 * animation (blink lids, thinking glance and lens glint, waiting tilt), keyed
 * off the data attributes below so reduced motion can switch them off.
 */
export function AlmaFace({
  size,
  mood = 'neutral',
  activity = 'idle',
  still = false,
  className = '',
}: {
  size: number
  mood?: FaceMood
  activity?: FaceActivity
  /** Static rendering for repeated small copies (message avatars). */
  still?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  const animated = !still && !reduced
  const drawn = fallbackMood(mood)
  // The vector face has no mouth flaps; a streaming reply reads as thinking.
  const shown = activity === 'talking' ? 'thinking' : activity
  const blinking = useBlink(animated && drawn !== 'happy')
  const id = useId().replace(/:/g, '')
  const leftClip = `${id}-lens-l`
  const rightClip = `${id}-lens-r`
  return (
    <svg
      className={`alma-face${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      data-mood={drawn}
      data-activity={shown}
      data-animated={animated ? 'true' : 'false'}
      data-blink={blinking ? 'true' : undefined}
    >
      <defs>
        <clipPath id={leftClip}>
          <circle cx={LEFT_EYE.x} cy={LEFT_EYE.y} r={LENS_R - 0.8} />
        </clipPath>
        <clipPath id={rightClip}>
          <circle cx={RIGHT_EYE.x} cy={RIGHT_EYE.y} r={LENS_R - 0.8} />
        </clipPath>
      </defs>
      <circle className="alma-face-disc" cx={32} cy={32} r={32} />
      <g className="alma-face-head">
        {/* Bob hair behind the face. */}
        <path
          className="alma-face-hair"
          d="M12 50 C9 30 16 13 32 13 C48 13 55 30 52 50 L46 50 C47 40 45 31 32 31 C19 31 17 40 18 50 Z"
        />
        <ellipse className="alma-face-skin" cx={32} cy={38} rx={16.5} ry={17} />
        {/* Uneven bangs over the forehead. */}
        <path
          className="alma-face-hair"
          d="M15 33 C15 21 22 15 32 15 C42 15 49 21 49 33 L45 29 L42 32 L38 26 L35 31 L31 25 L27 31 L24 27 L20 32 Z"
        />
        {/* Hair ornament, top right. */}
        <path
          className="alma-face-ornament"
          d="M44 15 L47 11 L48.5 15.5 L52 14.5 L49 18 Z"
        />
        <g className="alma-face-eyes">
          <Eye {...LEFT_EYE} mood={drawn} clipId={leftClip} />
          <Eye {...RIGHT_EYE} mood={drawn} clipId={rightClip} />
        </g>
        <g className="alma-face-glasses">
          <circle
            className="alma-face-lens"
            cx={LEFT_EYE.x}
            cy={LEFT_EYE.y}
            r={LENS_R}
          />
          <circle
            className="alma-face-lens"
            cx={RIGHT_EYE.x}
            cy={RIGHT_EYE.y}
            r={LENS_R}
          />
          <path className="alma-face-line" d="M30.6 37.2 Q32 36.2 33.4 37.2" />
          <g clipPath={`url(#${leftClip})`}>
            <rect
              className="alma-face-glint"
              x={14}
              y={28}
              width={3}
              height={20}
            />
          </g>
          <g clipPath={`url(#${rightClip})`}>
            <rect
              className="alma-face-glint"
              x={28}
              y={28}
              width={3}
              height={20}
            />
          </g>
        </g>
        <path className="alma-face-mouth" d={MOUTHS[drawn]} />
      </g>
    </svg>
  )
}
