import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'
const root = new URL('../../', import.meta.url).pathname
const skipped = new Set([
  'node_modules',
  // Local parallel checkouts (gitignored) contain their own copy of this test.
  '.worktrees',
  'build',
  '.gradle',
  'dist',
  'dev-dist',
  '.vite',
  '.github',
  'docs',
  'coverage',
  'artifacts',
  '.gitignore',
])
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      skipped.has(entry.name) ||
      entry.name === 'README.md' ||
      entry.name.endsWith('.tsbuildinfo')
    )
      return []
    const path = join(dir, entry.name)
    if (relative(root, path) === 'android/app/src/main/assets/public') return []
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : []
  })
}
it('keeps private integrations and the former namespace out of the public tree', () => {
  const forbidden =
    /companion|firebase|fcm|google-services|@capacitor\/push-notifications|firebase-messaging|dev\.almamobile/i
  const offenders = files(root)
    .filter((path) => path !== new URL(import.meta.url).pathname)
    .filter(
      (path) =>
        forbidden.test(relative(root, path)) ||
        forbidden.test(
          path.endsWith('/package-lock.json')
            ? JSON.stringify(
                JSON.parse(readFileSync(path, 'utf8')),
                (key, value) => (key === 'integrity' ? undefined : value),
              )
            : readFileSync(path, 'utf8'),
        ),
    )
    .map((path) => relative(root, path))
  expect(offenders).toEqual([])
})
