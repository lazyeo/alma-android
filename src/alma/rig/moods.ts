import type { FaceActivity, FaceMood } from '../faceState'

/**
 * Every value the renderer reads, as targets for the springs. Gaze is −1..1
 * (right/down positive), `open` is how wide the eyes are (1 normal),
 * `tilt` is head roll in radians, `bob` a vertical head offset as a fraction
 * of the rig height (down positive). Marks (blush, brows, sweat, gloom) are
 * 0..1 strengths.
 */
export interface RigPose {
  gazeX: number
  gazeY: number
  open: number
  /** Eyes drawn shut as ∩ (smiling) rather than ∪ (blink). */
  closed: boolean
  /** Squeezed shut: > <. */
  squint: number
  smile: number
  frown: number
  /** Wobbly mouth line. */
  wave: number
  /** Lopsided half-smile. */
  crook: number
  pupil: number
  tilt: number
  bob: number
  mouthOpen: number
  blush: number
  /** Brows pulled down toward the nose. */
  brow: number
  /** Brows lifted where they meet. */
  worry: number
  sweat: number
  gloom: number
  /** Fast jitter on top of the springs; too quick to ease. */
  tremble: number
  /** Gaze spring response in seconds: slow and deliberate when thinking. */
  gazeResponse: number
}

export const REST_POSE: RigPose = {
  gazeX: 0,
  gazeY: 0,
  open: 1,
  closed: false,
  squint: 0,
  smile: 0,
  frown: 0,
  wave: 0,
  crook: 0,
  pupil: 1,
  tilt: 0,
  bob: 0,
  mouthOpen: 0,
  blush: 0,
  brow: 0,
  worry: 0,
  sweat: 0,
  gloom: 0,
  tremble: 0,
  gazeResponse: 0.12,
}

/** Deterministic 0..1 noise for an integer slot, so poses stay pure. */
export function hash01(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Within a repeating `period`, is `t` inside [from, to)? */
const within = (t: number, period: number, from: number, to: number) => {
  const phase = ((t % period) + period) % period
  return phase >= from && phase < to
}

/**
 * Mood → pose at time `t` (seconds). Timed behaviours (a shy peek, an angry
 * huff, reading sweeps, nervous darts, a sleepy yawn) are functions of `t`
 * alone; at `t = 0` every mood shows its resting expression, which is what
 * reduced motion and static copies draw.
 */
export function moodPose(mood: FaceMood, t: number): Partial<RigPose> {
  switch (mood) {
    case 'happy':
      return {
        closed: true,
        smile: 1,
        blush: 0.35,
        tilt: Math.sin(t * 2.2) * 0.05,
        bob: -Math.abs(Math.sin(t * 4.2)) * 0.008,
      }
    case 'relaxed':
      return {
        gazeX: 0.12,
        gazeY: -0.15,
        open: 0.5,
        smile: 0.7,
        blush: 0.25,
        tilt: Math.sin(t * 0.7) * 0.07,
      }
    case 'shy': {
      // eyes down and away; near the end of each cycle a quick peek back
      const peek = within(t, 3.6, 3.05, 3.6)
      return {
        gazeX: peek ? 0.1 : 0.55,
        gazeY: peek ? 0.15 : 0.6,
        open: 0.86,
        smile: 0.25,
        blush: 1,
        wave: 0.35,
        tilt: 0.1,
      }
    }
    case 'angry': {
      // a glare, and every few seconds a huff: the head snaps aside
      const huff = within(t, 3.6, 2.5, 3.6)
      const side = Math.floor(t / 3.6) % 2 ? 1 : -1
      return {
        gazeX: huff ? 0.85 * side : 0,
        gazeY: huff ? -0.1 : 0.05,
        tilt: huff ? -0.08 * side : -0.03,
        open: 0.6,
        brow: 1,
        frown: 1,
        blush: 0.25,
      }
    }
    case 'busy': {
      // reading down a page: sweep a line, flick back, next line
      const phase = (t * 1.6) % 1
      const x =
        phase < 0.82
          ? -0.55 + (phase / 0.82) * 1.1
          : 0.55 - ((phase - 0.82) / 0.18) * 1.1
      return {
        gazeX: x,
        gazeY: 0.5,
        open: 0.9,
        sweat: 0.55,
        tilt: Math.sin(t * 3.1) * 0.015,
      }
    }
    case 'embarrassed':
      return {
        gazeX: -0.6,
        gazeY: 0.2,
        tilt: -0.07,
        open: 0.82,
        crook: 1,
        sweat: 1,
        blush: 0.3,
        gloom: 0.35,
      }
    case 'nervous': {
      const slot = Math.floor(t / 0.4)
      return {
        gazeX: t ? (hash01(slot) * 2 - 1) * 0.6 : 0,
        gazeY: t ? (hash01(slot + 0.5) * 2 - 1) * 0.3 : 0,
        open: 1.06,
        wave: 1,
        sweat: 0.7,
        blush: 0.15,
        tremble: 0.35,
      }
    }
    case 'scared':
      return {
        gazeX: Math.sin(t * 9) * 0.04,
        gazeY: -0.05,
        open: 1.1,
        pupil: 0.55,
        wave: 0.5,
        gloom: 1,
        sweat: 0.5,
        tremble: 1,
        bob: -0.01,
        mouthOpen: 0.28 + Math.sin(t * 13) * 0.06,
      }
    case 'sleepy': {
      // heavy lids, a slow nod, and now and then a yawn
      const cycle = ((t % 8) + 8) % 8
      const yawn = t > 0 && cycle > 6 && cycle < 7.6
      const nod = Math.max(0, Math.sin(t * 0.9)) ** 6
      return {
        gazeX: 0.1,
        gazeY: 0.35,
        open: yawn ? 0 : 0.3,
        squint: yawn ? 1 : 0,
        worry: 0.3,
        tilt: Math.sin(t * 0.5) * 0.05,
        bob: nod * 0.012,
        mouthOpen: yawn ? Math.sin(((cycle - 6) / 1.6) * Math.PI) * 0.9 : 0,
      }
    }
    case 'sad':
      return {
        gazeX: 0.2,
        gazeY: 0.5,
        open: 0.9,
        worry: 1,
        frown: 0.7,
        wave: 0.35,
        tilt: 0.06,
      }
    case 'thinking':
      return {
        gazeX: -0.7,
        gazeY: -0.9,
        open: 0.95,
        tilt: 0.07,
        gazeResponse: 0.4,
      }
    case 'tired':
      return {
        gazeX: 0.1,
        gazeY: 0.35,
        open: 0.45,
        worry: 0.5,
        gloom: 0.35,
        frown: 0.3,
        tilt: Math.sin(t * 0.5) * 0.05,
        bob: Math.max(0, Math.sin(t * 0.9)) ** 6 * 0.01,
      }
    default:
      return {}
  }
}

/**
 * A light, speech-like mouth while her reply streams: short syllables at
 * about 7 per second with an occasional rest. Bounded to 0..0.45 so it
 * reads as talking under any expression without shouting.
 */
export function talkingMouth(t: number) {
  const slot = Math.floor(t * 7)
  const rest = hash01(slot) < 0.2
  if (rest) return 0
  const phase = t * 7 - slot
  return (0.15 + hash01(slot + 0.3) * 0.3) * Math.sin(phase * Math.PI)
}

/** Activity layered over the mood: what she is doing shapes where she looks. */
export function activityPose(
  pose: RigPose,
  activity: FaceActivity,
  t: number,
): RigPose {
  switch (activity) {
    case 'thinking':
      // gaze up and to the side, slow; the head follows a little
      return {
        ...pose,
        gazeX: -0.6,
        gazeY: -0.85,
        tilt: pose.tilt + 0.07,
        gazeResponse: Math.max(pose.gazeResponse, 0.4),
      }
    case 'waiting':
      // a curious tilt toward the user
      return { ...pose, gazeX: pose.gazeX * 0.3, tilt: pose.tilt + 0.1 }
    case 'talking':
      return { ...pose, mouthOpen: Math.max(pose.mouthOpen, talkingMouth(t)) }
    default:
      return pose
  }
}

/** The complete target pose for a mood and activity at time `t`. */
export function rigTargets(
  mood: FaceMood,
  activity: FaceActivity,
  t: number,
): RigPose {
  return activityPose({ ...REST_POSE, ...moodPose(mood, t) }, activity, t)
}

/**
 * Reduced motion and static copies: the resting expression, with the
 * mouth closed (no flapping) but gaze and tilt still saying what she is
 * doing.
 */
export function staticTargets(mood: FaceMood, activity: FaceActivity): RigPose {
  const pose = rigTargets(mood, activity === 'talking' ? 'idle' : activity, 0)
  return { ...pose, tremble: 0 }
}
