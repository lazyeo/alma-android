import type { FaceActivity, FaceMood } from '../faceState'
import { DOUBLE_BLINK_GAP_S, blinkShut } from './blink'
import { rigTargets, staticTargets, type RigPose } from './moods'
import { Spring } from './spring'

/** Current, spring-smoothed values the renderer draws. */
export interface RigFrame {
  gazeX: number
  gazeY: number
  openL: number
  openR: number
  smile: number
  frown: number
  wave: number
  crook: number
  squint: number
  pupil: number
  tilt: number
  bob: number
  mouthOpen: number
  blush: number
  brow: number
  worry: number
  sweat: number
  gloom: number
  /** Eyes shut as ∩ rather than ∪. */
  closed: boolean
  /** Seconds since start, for marks that wobble. */
  time: number
}

const SPRUNG = [
  'gazeX',
  'gazeY',
  'openL',
  'openR',
  'smile',
  'frown',
  'wave',
  'crook',
  'squint',
  'pupil',
  'tilt',
  'bob',
  'mouthOpen',
  'blush',
  'brow',
  'worry',
  'sweat',
  'gloom',
] as const
type SprungKey = (typeof SPRUNG)[number]

/** Breathing: one slow bob every 4.2 s, a few tenths of a percent of height. */
export function breathingBob(t: number) {
  return Math.sin((t * 2 * Math.PI) / 4.2) * 0.003
}

/**
 * Drives one face: springs for every parameter, blinks, small idle
 * saccades and breathing. Pure apart from `random` (saccade spacing), so it
 * can be stepped deterministically in tests.
 */
export class RigEngine {
  private springs: Record<SprungKey, Spring> = {
    gazeX: new Spring(0, 0.12),
    gazeY: new Spring(0, 0.12),
    openL: new Spring(1, 0.06),
    openR: new Spring(1, 0.06),
    smile: new Spring(0, 0.25),
    frown: new Spring(0, 0.25),
    wave: new Spring(0, 0.25),
    crook: new Spring(0, 0.3),
    squint: new Spring(0, 0.12),
    pupil: new Spring(1, 0.18),
    tilt: new Spring(0, 0.6),
    bob: new Spring(0, 0.5),
    mouthOpen: new Spring(0, 0.07),
    blush: new Spring(0, 0.5),
    brow: new Spring(0, 0.25),
    worry: new Spring(0, 0.3),
    sweat: new Spring(0, 0.35),
    gloom: new Spring(0, 0.4),
  }
  private blinks: number[] = []
  private saccade = { x: 0, y: 0, next: 0 }
  private closed = false
  private time = 0

  constructor(private random: () => number = Math.random) {}

  /** Queue a blink (or a quick pair) starting at `now` seconds. */
  blink(now: number, double = false) {
    this.blinks = this.blinks.filter((start) => now - start < 1)
    this.blinks.push(now)
    if (double) this.blinks.push(now + DOUBLE_BLINK_GAP_S)
  }

  private aim(pose: RigPose, now: number, idle: boolean) {
    const s = this.springs
    this.closed = pose.closed
    let gazeX = pose.gazeX
    let gazeY = pose.gazeY
    if (idle) {
      // small saccades: a glance a little off, then back, every 0.8–3 s
      if (now >= this.saccade.next) {
        const away = this.random() < 0.5
        this.saccade.x = away ? (this.random() * 2 - 1) * 0.25 : 0
        this.saccade.y = away ? (this.random() * 2 - 1) * 0.12 : 0
        this.saccade.next = now + 0.8 + this.random() * 2.2
      }
      gazeX += this.saccade.x
      gazeY += this.saccade.y
    }
    s.gazeX.target = clamp(gazeX, -1, 1)
    s.gazeY.target = clamp(gazeY, -1, 1)
    s.gazeX.config.response = s.gazeY.config.response = pose.gazeResponse
    const shutByMood = pose.closed || pose.squint > 0.5
    const shut = !shutByMood && blinkShut(this.blinks, now)
    const open = shutByMood ? 0 : shut ? 0 : pose.open
    for (const eye of [s.openL, s.openR]) {
      eye.target = open
      // snap shut fast, open a little slower
      eye.config.response = open < eye.value ? 0.05 : 0.11
    }
    s.smile.target = pose.smile
    s.frown.target = pose.frown
    s.wave.target = pose.wave
    s.crook.target = pose.crook
    s.squint.target = pose.squint
    s.pupil.target = pose.pupil
    s.tilt.target = pose.tilt
    s.bob.target = pose.bob + (idle ? breathingBob(now) : 0)
    s.mouthOpen.target = pose.mouthOpen
    s.blush.target = pose.blush
    s.brow.target = pose.brow
    s.worry.target = pose.worry
    s.sweat.target = pose.sweat
    s.gloom.target = pose.gloom
    return pose
  }

  /** One animated frame at `now` seconds, `dt` since the last. */
  update(
    now: number,
    dt: number,
    mood: FaceMood,
    activity: FaceActivity,
  ): RigFrame {
    this.time = now
    const pose = this.aim(
      rigTargets(mood, activity, now),
      now,
      activity !== 'thinking',
    )
    const step = Math.min(dt, 1 / 20)
    for (const key of SPRUNG) this.springs[key].step(step)
    const frame = this.frame()
    if (pose.tremble > 0) {
      const tr = pose.tremble
      frame.tilt += tr * Math.sin(now * 53) * 0.012
      frame.gazeX += tr * (Math.sin(now * 47) + Math.sin(now * 31)) * 0.02
    }
    return frame
  }

  /** The resting expression, springs settled: reduced motion, still copies. */
  settle(mood: FaceMood, activity: FaceActivity): RigFrame {
    this.aim(staticTargets(mood, activity), 0, false)
    for (const key of SPRUNG) this.springs[key].snap()
    return this.frame()
  }

  frame(): RigFrame {
    const values = {} as Record<SprungKey, number>
    for (const key of SPRUNG) values[key] = this.springs[key].value
    return {
      ...values,
      openL: clamp(values.openL, 0, 1.2),
      openR: clamp(values.openR, 0, 1.2),
      closed: this.closed,
      time: this.time,
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
