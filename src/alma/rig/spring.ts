/**
 * A damped spring toward a moving target. `response` is roughly the time
 * (seconds) to settle; `damping` 1 is critical (no overshoot), below 1
 * bounces. Integration uses small fixed substeps so a stiff spring stays
 * stable through a slow frame.
 */
export interface SpringConfig {
  response: number
  damping: number
}

export interface SpringState {
  value: number
  velocity: number
}

const SUBSTEP = 1 / 480

export function stepSpring(
  state: SpringState,
  target: number,
  { response, damping }: SpringConfig,
  dt: number,
): SpringState {
  if (!(dt > 0)) return state
  const stiffness = ((2 * Math.PI) / response) ** 2
  const friction = (4 * Math.PI * damping) / response
  const steps = Math.ceil(dt / SUBSTEP)
  const h = dt / steps
  let { value, velocity } = state
  for (let i = 0; i < steps; i++) {
    velocity += (stiffness * (target - value) - friction * velocity) * h
    value += velocity * h
  }
  return { value, velocity }
}

export class Spring implements SpringState {
  value: number
  velocity = 0
  target: number
  config: SpringConfig

  constructor(value: number, response: number, damping = 1) {
    this.value = value
    this.target = value
    this.config = { response, damping }
  }

  step(dt: number) {
    const next = stepSpring(this, this.target, this.config, dt)
    this.value = next.value
    this.velocity = next.velocity
    return this.value
  }

  /** Jump straight to the target: reduced motion and static copies. */
  snap() {
    this.value = this.target
    this.velocity = 0
  }
}
