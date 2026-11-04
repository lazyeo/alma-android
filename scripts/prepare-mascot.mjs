// Bundles the official Alma mascot art (eyeless base, per-eye white/iris/lid
// layers and rig.json) from the pinned official Android release into the web
// app, at build time. The art is © yetone / Alma (see NOTICE.md); it is never
// committed to this repository, only downloaded, verified and unpacked here.
//
//   tsx scripts/prepare-mascot.mjs [dest-dir]   (default: public/alma-mascot)
//
// Environment:
//   ALMA_MASCOT=skip          skip the download and remove any bundled art;
//                             the app falls back to its vector face
//   ALMA_MASCOT_MAX_SIDE=512  downscale the art (and rig) to this many pixels
//                             on the longer side; 0 keeps full size
//   ALMA_MASCOT_CACHE=dir     where the verified APK is cached
//                             (default: $XDG_CACHE_HOME or ~/.cache, /alma-mobile)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { rigScaleFactor, scaleRig } from '../src/alma/rig/rigScale.ts'

const release = {
  url: 'https://github.com/yetone/alma-releases/releases/download/android-v1.92/Alma-1.92.apk',
  file: 'Alma-1.92.apk',
  sha256: '4012502c7a800eea8275a657b3fb506cd4dbacc36843114fe045058c210edea5',
}
const eyeLayers = ['L', 'R'].flatMap((side) =>
  ['white', 'iris', 'lid'].map((layer) => `eye-${side}-${layer}.png`),
)
const layers = ['base.png', ...eyeLayers, 'rig.json']

const dest = resolve(process.argv[2] ?? 'public/alma-mascot')
const log = (message) => console.log(`prepare-mascot: ${message}`)
function fail(message) {
  console.error(`prepare-mascot: ${message}`)
  console.error(
    'prepare-mascot: set ALMA_MASCOT=skip to build with the vector face instead.',
  )
  process.exit(1)
}

if (process.env.ALMA_MASCOT === 'skip') {
  rmSync(dest, { recursive: true, force: true })
  log('skipped (ALMA_MASCOT=skip); the app keeps its vector face')
  process.exit(0)
}

const maxSide = Number(process.env.ALMA_MASCOT_MAX_SIDE ?? 512)
if (!Number.isFinite(maxSide) || maxSide < 0)
  fail(`ALMA_MASCOT_MAX_SIDE must be a non-negative number, got ${maxSide}`)

const has = (tool) => {
  try {
    execFileSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
// sips on macOS, ImageMagick elsewhere; without either the art stays full
// size (larger, but correct) rather than breaking the build.
const resizer = has('sips')
  ? (file, w, h) =>
      execFileSync('sips', ['-z', String(h), String(w), file], {
        stdio: 'ignore',
      })
  : ['magick', 'convert'].filter(has).map(
      (tool) => (file, w, h) =>
        execFileSync(tool, [file, '-resize', `${w}x${h}!`, file], {
          stdio: 'ignore',
        }),
    )[0]
const limit = resizer ? maxSide : 0
const stamp = `${release.sha256} ${limit}\n`
const stampFile = join(dest, '.source')

if (
  existsSync(stampFile) &&
  readFileSync(stampFile, 'utf8') === stamp &&
  layers.every((layer) => existsSync(join(dest, layer)))
) {
  log(`up to date (${dest})`)
  process.exit(0)
}

const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const cacheDir =
  process.env.ALMA_MASCOT_CACHE ||
  join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'alma-mobile')
const apk = join(cacheDir, release.file)
mkdirSync(cacheDir, { recursive: true })
if (!existsSync(apk) || sha256(apk) !== release.sha256) {
  log(`downloading ${release.url}`)
  const partial = `${apk}.partial`
  try {
    const response = await fetch(release.url, { redirect: 'follow' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    writeFileSync(partial, Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    rmSync(partial, { force: true })
    fail(`could not download the official APK (${error.message ?? error})`)
  }
  const actual = sha256(partial)
  if (actual !== release.sha256) {
    rmSync(partial, { force: true })
    fail(
      `official APK checksum mismatch (expected ${release.sha256}, got ${actual})`,
    )
  }
  renameSync(partial, apk)
}

if (!has('unzip')) fail('unzip is required to unpack the official APK')
const work = mkdtempSync(join(tmpdir(), 'alma-mascot-'))
let failure
try {
  execFileSync(
    'unzip',
    [
      '-q',
      '-j',
      '-o',
      apk,
      ...layers.map((layer) => `assets/mascot/${layer}`),
      '-d',
      work,
    ],
    { stdio: 'inherit' },
  )
  for (const layer of layers)
    if (!existsSync(join(work, layer)))
      throw new Error(`the official APK has no assets/mascot/${layer}`)

  const rigPath = join(work, 'rig.json')
  const original = JSON.parse(readFileSync(rigPath, 'utf8'))
  const rig = scaleRig(original, rigScaleFactor(original, limit))
  writeFileSync(rigPath, JSON.stringify(rig))
  if (limit > 0) {
    // Resize each image to exactly the pixel sizes the scaled rig reports.
    resizer(join(work, 'base.png'), rig.size[0], rig.size[1])
    for (const side of ['L', 'R'])
      for (const layer of ['white', 'iris', 'lid'])
        resizer(
          join(work, `eye-${side}-${layer}.png`),
          rig.eyes[side].w,
          rig.eyes[side].h,
        )
  } else if (!resizer) {
    log('no image tool (sips or ImageMagick) found; keeping full-size art')
  }

  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const layer of layers) cpSync(join(work, layer), join(dest, layer))
  writeFileSync(stampFile, stamp)
  log(`official mascot art in ${dest} (${rig.size[0]}x${rig.size[1]})`)
} catch (error) {
  failure = error
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (failure) fail(failure.message ?? String(failure))
