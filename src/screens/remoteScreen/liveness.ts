// Detects when the Mac sends no usable picture: the display is asleep, the
// lid is closed, or the WebRTC track exists but never delivers a frame.

/** JPEG frames normally arrive several times a second even when idle. */
export const FRAME_STALL_MS = 5_000

export function isFrameStalled(
  lastFrameAt: number | undefined,
  now: number,
  stallMs = FRAME_STALL_MS,
) {
  return lastFrameAt !== undefined && now - lastFrameAt > stallMs
}

/** RGBA samples of a downscaled frame; true when every pixel is near black. */
export function isDarkSample(rgba: ArrayLike<number>, threshold = 12) {
  for (let i = 0; i + 2 < rgba.length; i += 4)
    if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) > threshold) return false
  return rgba.length >= 4
}

/** Transparent 1×1 GIF: hides the WebView's default play-button poster. */
export const BLANK_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
