import { describe, expect, it } from 'vitest'
import type { FaceActivity, FaceMood } from '../faceState'
import { RigEngine, breathingBob } from './engine'

function run(
  engine: RigEngine,
  mood: FaceMood,
  activity: FaceActivity,
  from: number,
  seconds: number,
) {
  let frame = engine.update(from, 1 / 60, mood, activity)
  for (let t = from; t < from + seconds; t += 1 / 60)
    frame = engine.update(t, 1 / 60, mood, activity)
  return frame
}

describe('RigEngine', () => {
  it('eases into a new mood rather than jumping', () => {
    const engine = new RigEngine(() => 0.9)
    const first = engine.update(0, 1 / 60, 'angry', 'idle')
    expect(first.brow).toBeGreaterThan(0)
    expect(first.brow).toBeLessThan(0.2)
    const later = run(engine, 'angry', 'idle', 0, 1.5)
    expect(later.brow).toBeCloseTo(1, 2)
  })

  it('closes both lids for a blink and reopens them', () => {
    const engine = new RigEngine(() => 0.9)
    run(engine, 'neutral', 'idle', 0, 1)
    engine.blink(1)
    const shut = run(engine, 'neutral', 'idle', 1, 0.06)
    expect(shut.openL).toBeLessThan(0.4)
    expect(shut.openR).toBeLessThan(0.4)
    const open = run(engine, 'neutral', 'idle', 1.07, 0.6)
    expect(open.openL).toBeGreaterThan(0.95)
  })

  it('does not blink eyes that are already shut in a smile', () => {
    const engine = new RigEngine(() => 0.9)
    const frame = run(engine, 'happy', 'idle', 0, 1)
    expect(frame.closed).toBe(true)
    expect(frame.openL).toBeLessThan(0.05)
  })

  it('adds small idle saccades but none while thinking', () => {
    const values = [0.1, 1, 0, 0.9]
    let i = 0
    const engine = new RigEngine(() => values[i++ % values.length])
    const idle = run(engine, 'neutral', 'idle', 0, 0.5)
    // away (0.1 < 0.5), x = (1 * 2 − 1) * 0.25
    expect(idle.gazeX).toBeCloseTo(0.25, 1)
    expect(Math.abs(idle.gazeX)).toBeLessThanOrEqual(0.26)
    const thinking = run(new RigEngine(() => 0.1), 'neutral', 'thinking', 0, 2)
    expect(thinking.gazeX).toBeCloseTo(-0.6, 1)
  })

  it('breathes with a small slow bob while idle', () => {
    expect(Math.abs(breathingBob(1.05))).toBeCloseTo(0.003, 4)
    expect(breathingBob(0)).toBe(0)
  })

  it('settles straight onto the static expression', () => {
    const engine = new RigEngine()
    const frame = engine.settle('scared', 'idle')
    expect(frame.pupil).toBeCloseTo(0.55)
    expect(frame.openL).toBeCloseTo(1.1)
    expect(engine.settle('happy', 'talking').mouthOpen).toBe(0)
  })
})
