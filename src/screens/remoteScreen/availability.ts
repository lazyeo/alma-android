// Why the desktop cannot share its screen. Screen sharing is implemented by
// the desktop app (macOS only, through its bundled Computer Use helper), so
// these reasons describe the desktop, never the phone or the connection.

export type ScreenUnavailableReason =
  'unsupported-os' | 'helper-missing' | 'other'

export interface ScreenUnavailable {
  reason: ScreenUnavailableReason
  /** The desktop's own message, kept for reasons we do not recognise. */
  detail?: string
}

/** Reads a `status` message with `bound: false` and an `error` string. */
export function screenUnavailableFromStatus(status?: {
  bound: boolean
  error?: string
}): ScreenUnavailable | undefined {
  if (!status || status.bound || !status.error) return undefined
  if (/only available on macOS/i.test(status.error))
    return { reason: 'unsupported-os' }
  if (/Computer Use helper/i.test(status.error))
    return { reason: 'helper-missing' }
  return { reason: 'other', detail: status.error }
}

const COPY_SUFFIX = {
  'unsupported-os': 'UnsupportedOs',
  'helper-missing': 'HelperMissing',
  other: 'Other',
} as const satisfies Record<ScreenUnavailableReason, string>

/** Copy keys under `screen.*` for a reason. */
export function unavailableCopy(reason: ScreenUnavailableReason) {
  const suffix = COPY_SUFFIX[reason]
  return {
    title: `screen.unavailableTitle${suffix}`,
    body: `screen.unavailableBody${suffix}`,
  } as const
}

// The client cannot ask a desktop for its platform (`/api/computer-use/*` is
// on the deny list), so the last refusal is remembered per desktop and shown
// in Settings. A successful stream clears it.
const storageKey = (desktopId: string) => `alma.screen.unavailable.${desktopId}`

export function rememberScreenUnavailable(
  desktopId: string,
  value: ScreenUnavailable | undefined,
) {
  try {
    if (value)
      localStorage.setItem(
        storageKey(desktopId),
        JSON.stringify({ reason: value.reason }),
      )
    else localStorage.removeItem(storageKey(desktopId))
  } catch {
    // Storage is best effort.
  }
}

export function recallScreenUnavailable(
  desktopId: string,
): ScreenUnavailable | undefined {
  try {
    const raw = localStorage.getItem(storageKey(desktopId))
    const reason = raw ? JSON.parse(raw)?.reason : undefined
    return reason in COPY_SUFFIX
      ? { reason: reason as ScreenUnavailableReason }
      : undefined
  } catch {
    return undefined
  }
}
