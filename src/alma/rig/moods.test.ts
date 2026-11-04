import { describe, expect, it } from 'vitest'
import { FACE_MOODS, faceMoodFromVitals } from '../faceState'
import { REST_POSE, rigTargets, staticTargets, talkingMouth } from './moods'

describe('mood targets', () => {
  it('gives every mood a distinct resting expression', () => {
    const signatures = FACE_MOODS.map((mood) =>
      JSON.stringify(staticTargets(mood, 'idle')),
    )
    expect(new Set(signatures).size).toBe(FACE_MOODS.length)
    expect(staticTargets('neutral', 'idle')).toEqual(REST_POSE)
  })

  it('maps vitals through to the rig pose', () => {
    const angry = staticTargets(
      faceMoodFromVitals({ mood: 'frustrated' }),
      'idle',
    )
    expect(angry.brow).toBe(1)
    expect(angry.frown).toBe(1)
    const sleepy = staticTargets(
      faceMoodFromVitals({ isNight: true, energy: 2 }),
      'idle',
    )
    expect(sleepy.open).toBeLessThan(0.5)
    const happy = staticTargets(faceMoodFromVitals({ valence: 9 }), 'idle')
    expect(happy.closed).toBe(true)
    expect(happy.smile).toBe(1)
  })

  it('draws the feeling marks each mood needs', () => {
    expect(staticTargets('shy', 'idle').blush).toBe(1)
    expect(staticTargets('scared', 'idle').pupil).toBeLessThan(1)
    expect(staticTargets('scared', 'idle').mouthOpen).toBeGreaterThan(0)
    expect(staticTargets('sad', 'idle').worry).toBe(1)
    expect(staticTargets('embarrassed', 'idle').sweat).toBe(1)
    expect(staticTargets('busy', 'idle').gazeY).toBeGreaterThan(0)
    expect(staticTargets('thinking', 'idle').gazeY).toBeLessThan(0)
  })

  it('makes timed behaviours vary with time but not at rest', () => {
    // a shy peek near the end of each cycle
    expect(rigTargets('shy', 'idle', 1).gazeX).toBeCloseTo(0.55)
    expect(rigTargets('shy', 'idle', 3.3).gazeX).toBeCloseTo(0.1)
    // the angry huff alternates sides
    expect(Math.sign(rigTargets('angry', 'idle', 3).gazeX)).toBe(-1)
    expect(Math.sign(rigTargets('angry', 'idle', 6.6).gazeX)).toBe(1)
    // a sleepy yawn shuts the eyes and opens the mouth
    const yawn = rigTargets('sleepy', 'idle', 6.8)
    expect(yawn.squint).toBe(1)
    expect(yawn.mouthOpen).toBeGreaterThan(0.5)
    expect(staticTargets('sleepy', 'idle').mouthOpen).toBe(0)
    // nervous darts move between slots
    expect(rigTargets('nervous', 'idle', 0.1).gazeX).not.toBe(
      rigTargets('nervous', 'idle', 0.5).gazeX,
    )
  })
})

describe('activity targets', () => {
  it('looks up and to the side, slowly, while thinking', () => {
    const pose = rigTargets('neutral', 'thinking', 2)
    expect(pose.gazeX).toBeLessThan(-0.5)
    expect(pose.gazeY).toBeLessThan(-0.5)
    expect(pose.gazeResponse).toBeGreaterThan(REST_POSE.gazeResponse)
  })

  it('tilts the head while waiting', () => {
    expect(rigTargets('neutral', 'waiting', 2).tilt).toBeGreaterThan(0.05)
    expect(rigTargets('sad', 'waiting', 2).tilt).toBeGreaterThan(
      rigTargets('sad', 'idle', 2).tilt,
    )
  })

  it('flaps the mouth lightly while talking, with rests', () => {
    const samples = Array.from({ length: 700 }, (_, i) => talkingMouth(i / 100))
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.45)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0)
    expect(samples.filter((value) => value > 0.1).length).toBeGreaterThan(200)
    expect(samples.filter((value) => value === 0).length).toBeGreaterThan(20)
    expect(
      rigTargets('neutral', 'talking', 0.07).mouthOpen,
    ).toBeGreaterThanOrEqual(talkingMouth(0.07))
  })

  it('keeps a static copy quiet while talking', () => {
    expect(staticTargets('neutral', 'talking').mouthOpen).toBe(0)
    expect(staticTargets('nervous', 'idle').tremble).toBe(0)
    expect(staticTargets('neutral', 'waiting').tilt).toBeGreaterThan(0)
  })
})
