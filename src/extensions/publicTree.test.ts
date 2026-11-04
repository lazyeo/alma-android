import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'
const root = new URL('../../', import.meta.url).pathname
const skipped = new Set([
  // Git internals: loose objects are compressed bytes (history is gitleaks-scanned).
  '.git',
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
// scripts/prepare-mascot.mjs downloads the official Alma art at build time
// into this gitignored directory; the art must never be committed.
const mascotOutput = 'public/alma-mascot/'
function trackedFiles() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (realpathSync(top) !== realpathSync(root)) throw new Error('not ours')
    return execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
  } catch {
    // An exported tree without git: every file on disk counts, except the
    // build output that is ignored in a checkout.
    return files(root)
      .map((path) => relative(root, path))
      .filter((path) => !path.startsWith(mascotOutput))
  }
}
it('never commits the official mascot art', () => {
  const official =
    /(?:^|\/)(?:base|eye-[LR]-(?:white|iris|lid))\.png$|(?:^|\/)assets\/mascot\//
  const offenders = trackedFiles().filter(
    (path) => path.startsWith(mascotOutput) || official.test(path),
  )
  expect(offenders).toEqual([])
  expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain(
    `\n${mascotOutput}\n`,
  )
})
