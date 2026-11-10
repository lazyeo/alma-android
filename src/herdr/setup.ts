/**
 * Herdr Core setup on the desktop (0.4.525): `GET /api/herdr/setup` →
 * `{online, phase, error?}`; `POST /api/herdr/setup/install|start` answer the
 * same shape with 200 (online) or 502 (failed), or 400 `unsupported` when
 * the desktop runs inside a Herdr session.
 *
 * `phase` comes from the binary on disk, not the process: "stopped" means
 * installed, and is also what an online Herdr reports. Decide on `online`
 * first; the phase only picks the offline action.
 */
export type HerdrSetupPhase =
  'installing' | 'starting' | 'stopped' | 'missing' | 'unsupported'

export interface HerdrSetupState {
  online: boolean
  phase: HerdrSetupPhase
  /** Last install/start failure, until the next attempt. */
  error?: string
}

const phases = new Set<string>([
  'installing',
  'starting',
  'stopped',
  'missing',
  'unsupported',
])

export function parseHerdrSetup(json: unknown): HerdrSetupState | undefined {
  if (!json || typeof json !== 'object') return undefined
  const { online, phase, error } = json as Record<string, unknown>
  if (typeof phase !== 'string' || !phases.has(phase)) return undefined
  return {
    online: online === true,
    phase: phase as HerdrSetupPhase,
    ...(typeof error === 'string' && error.trim()
      ? { error: error.trim() }
      : {}),
  }
}

export type HerdrSetupAction = 'install' | 'start' | 'busy' | 'none'

/** What the offline Herdr page offers for a setup state. */
export function herdrSetupAction(
  setup: Pick<HerdrSetupState, 'online' | 'phase'> | undefined,
): HerdrSetupAction {
  if (!setup || setup.online) return 'none'
  if (setup.phase === 'missing') return 'install'
  if (setup.phase === 'stopped') return 'start'
  if (setup.phase === 'installing' || setup.phase === 'starting') return 'busy'
  return 'none'
}

export const herdrSetupBusy = (phase: HerdrSetupPhase | undefined) =>
  phase === 'installing' || phase === 'starting'
