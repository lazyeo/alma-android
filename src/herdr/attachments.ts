export const HERDR_MAX_UPLOAD_BYTES = 30 * 1024 * 1024
export const HERDR_SINGLE_UPLOAD_BYTES = Math.floor(5.5 * 1024 * 1024)
export const HERDR_CHUNK_BYTES = 4 * 1024 * 1024

export type HerdrUploadPlan = 'single' | 'chunked' | 'tooLarge'

export function buildHerdrPrompt(paths: readonly string[], text: string) {
  return paths
    .map((path) => (path.includes(' ') ? `"${path}"` : path))
    .concat(text.trim())
    .filter(Boolean)
    .join(' ')
}

export function planHerdrUpload(size: number): HerdrUploadPlan {
  if (size > HERDR_MAX_UPLOAD_BYTES) return 'tooLarge'
  return size <= HERDR_SINGLE_UPLOAD_BYTES ? 'single' : 'chunked'
}
