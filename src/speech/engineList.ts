// The settings page's view of the engine order: which engines are in use,
// which sit folded under "More engines", and what each row says about its key.
import {
  engineEnabled,
  engineReady,
  moveEngine,
  resolveEngine,
  type SpeechSettings,
} from './engineStore'
import type { KeyStatus } from './nativeSpeech'
import { keyIdOf, PRESETS } from './presets'

/** Always listed; the rest fold away until they are switched on. */
export const COMMON_ENGINES: readonly string[] = [
  'soniox-rt',
  'soniox-async',
  'openai',
]

/** One row per key id, in preset order: the shared Soniox key once. */
export const KEY_PROVIDERS: readonly string[] = [
  ...new Set(PRESETS.map(keyIdOf)),
]

/** Key statuses by key id; a missing entry is still loading. */
export type KeyStatuses = Readonly<Record<string, KeyStatus | undefined>>

/** True when more than one engine uses this key id. */
export function sharedKey(keyId: string): boolean {
  return PRESETS.filter((preset) => keyIdOf(preset) === keyId).length > 1
}

/**
 * On: switched on, set up, and with a saved key. A dictation skips the
 * others, so the switch shows what will actually be tried. While the key
 * status loads, the saved switch stands.
 */
export function engineOn(
  settings: SpeechSettings,
  id: string,
  keys: KeyStatuses,
): boolean {
  if (!engineEnabled(settings, id)) return false
  const engine = resolveEngine(settings, id)
  if (!engineReady(engine)) return false
  return keys[keyIdOf(engine)]?.set !== false
}

/** The order card's rows, and the engines folded under "More engines". */
export function engineGroups(
  settings: SpeechSettings,
  keys: KeyStatuses,
): { listed: string[]; more: string[] } {
  const listed: string[] = []
  const more: string[] = []
  for (const id of settings.order)
    (COMMON_ENGINES.includes(id) || engineOn(settings, id, keys)
      ? listed
      : more
    ).push(id)
  return { listed, more }
}

/**
 * Moves `id` to position `to` among the listed rows, keeping folded
 * engines where they are relative to the rest of the order.
 */
export function moveListed(
  settings: SpeechSettings,
  listed: readonly string[],
  id: string,
  to: number,
): SpeechSettings {
  const others = listed.filter((item) => item !== id)
  const clamped = Math.max(0, Math.min(others.length, to))
  // Land just before the row that ends up after it, or just after the last.
  const anchor = others[clamped] ?? others.at(-1)
  if (!anchor) return settings
  const order = settings.order.filter((item) => item !== id)
  const at = order.indexOf(anchor) + (others[clamped] ? 0 : 1)
  return moveEngine(settings, id, at)
}

export type KeyBadge =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'set'; last4?: string; shared: boolean }

export function keyBadge(keyId: string, status?: KeyStatus): KeyBadge {
  if (!status) return { kind: 'loading' }
  if (!status.set) return { kind: 'missing' }
  return { kind: 'set', last4: status.last4, shared: sharedKey(keyId) }
}
