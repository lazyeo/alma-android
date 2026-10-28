#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const commandArgs = args.filter((arg) => arg !== '--dry-run')
const command = commandArgs[0]
const root = process.cwd()

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

function run(program, programArgs, options = {}) {
  const rendered = [program, ...programArgs].join(' ')
  if (dryRun && options.mutates) {
    console.log(`[dry-run] ${rendered}`)
    return ''
  }

  const result = spawnSync(program, programArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
  })
  if (result.error) fail(`${rendered}: ${result.error.message}`)
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr)
    fail(`${rendered} exited with status ${result.status}`)
  }
  return options.capture ? result.stdout.trim() : ''
}

function git(...gitArgs) {
  return run('git', gitArgs, { capture: true })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  if (!match) fail(`expected a stable SemVer version, received ${version}`)
  const numbers = match.slice(1).map(Number)
  if (numbers[1] > 99 || numbers[2] > 99)
    fail(
      'minor and patch must be at most 99 for the Android versionCode formula',
    )
  return numbers
}

function assertRepository() {
  try {
    readFileSync(resolve(root, 'package.json'), 'utf8')
  } catch {
    fail('run this command from the repository root')
  }
}

function assertCleanMain() {
  const branch = git('branch', '--show-current')
  if (branch !== 'main')
    fail(
      `release preparation requires main (current: ${branch || 'detached HEAD'})`,
    )
  const status = git('status', '--porcelain')
  if (status) fail('release preparation requires a clean git tree')
}

function replaceUnreleased(changelog, version, date) {
  const heading = '## [Unreleased]'
  const start = changelog.indexOf(heading)
  if (start < 0) fail('CHANGELOG.md has no [Unreleased] section')
  const next = changelog.indexOf('\n## [', start + heading.length)
  if (next < 0) fail('CHANGELOG.md has no version section after [Unreleased]')

  const body = changelog.slice(start + heading.length, next).trim()
  const meaningfulBody = body
    .replace(/### Added\s*\n\s*- Nothing yet\./g, '')
    .trim()
  const reset = `${heading}\n\n### Added\n\n- Nothing yet.\n`
  const existingPattern = new RegExp(
    `## \\[${version.replaceAll('.', '\\.')}\\] - (?:Unreleased|\\d{4}-\\d{2}-\\d{2})`,
  )
  const existing = existingPattern.exec(changelog)

  if (existing) {
    const dated = changelog.replace(existing[0], `## [${version}] - ${date}`)
    if (!meaningfulBody) return dated
    const insertion = dated.indexOf('\n', existing.index) + 1
    return `${dated.slice(0, start)}${reset}${dated.slice(next + 1, insertion)}\n${meaningfulBody}\n${dated.slice(insertion)}`
  }

  const versionSection = `## [${version}] - ${date}\n\n${meaningfulBody || '### Changed\n\n- Release metadata.'}\n`
  return `${changelog.slice(0, start)}${reset}\n${versionSection}${changelog.slice(next + 1)}`
}

function updateCompareLinks(changelog, previousVersion, version) {
  const unreleased = `[Unreleased]: https://github.com/lazyeo/alma-android/compare/v${version}...HEAD`
  const versionLink = `[${version}]: https://github.com/lazyeo/alma-android/compare/v${previousVersion}...v${version}`
  let next = changelog.replace(/^\[Unreleased\]:.*$/m, unreleased)
  if (new RegExp(`^\\[${version.replaceAll('.', '\\.')}\\]:`, 'm').test(next))
    return next
  return `${next.trimEnd()}\n${versionLink}\n`
}

function prepare(version) {
  parseVersion(version)
  assertCleanMain()

  const packagePath = resolve(root, 'package.json')
  const lockPath = resolve(root, 'package-lock.json')
  const changelogPath = resolve(root, 'CHANGELOG.md')
  const packageJson = readJson(packagePath)
  const previousVersion = packageJson.version
  parseVersion(previousVersion)

  const [major, minor, patch] = parseVersion(version)
  const [oldMajor, oldMinor, oldPatch] = parseVersion(previousVersion)
  const nextCode = major * 10000 + minor * 100 + patch
  const oldCode = oldMajor * 10000 + oldMinor * 100 + oldPatch
  if (nextCode <= oldCode)
    fail(`${version} must be newer than ${previousVersion}`)

  const tag = `v${version}`
  if (git('tag', '--list', tag)) fail(`tag ${tag} already exists`)

  const date = new Date().toISOString().slice(0, 10)
  const lockJson = readJson(lockPath)
  const changelog = updateCompareLinks(
    replaceUnreleased(readFileSync(changelogPath, 'utf8'), version, date),
    previousVersion,
    version,
  )

  packageJson.version = version
  lockJson.version = version
  if (lockJson.packages?.['']) lockJson.packages[''].version = version

  if (dryRun) {
    console.log(
      `[dry-run] update package.json and package-lock.json to ${version}`,
    )
    console.log(`[dry-run] date CHANGELOG.md section ${version} as ${date}`)
  } else {
    writeJson(packagePath, packageJson)
    writeJson(lockPath, lockJson)
    writeFileSync(changelogPath, changelog)
  }

  run('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md'], {
    mutates: true,
  })
  run('git', ['commit', '-m', `chore(release): ${tag}`], { mutates: true })
  run('git', ['tag', '-a', tag, '-m', tag], { mutates: true })
  console.log(`Prepared ${tag}. This script does not push.`)
  console.log('Push after review with: git push --follow-tags origin main')
}

function findApksigner() {
  const direct = spawnSync('apksigner', ['version'], { stdio: 'ignore' })
  if (direct.status === 0) return 'apksigner'

  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  if (!sdk)
    fail('apksigner is not on PATH and ANDROID_HOME/ANDROID_SDK_ROOT is unset')
  const output = execFileSync(
    'find',
    [join(sdk, 'build-tools'), '-name', 'apksigner', '-type', 'f'],
    {
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort()
  if (!output.length) fail('could not find apksigner in the Android SDK')
  return output.at(-1)
}

function findReleaseApk() {
  const output = execFileSync(
    'find',
    [
      resolve(root, 'android/app/build/outputs/apk/release'),
      '-name',
      '*.apk',
      '-type',
      'f',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
  if (output.length !== 1)
    fail(`expected one release APK, found ${output.length}`)
  return output[0]
}

function changelogNotes(version) {
  const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
  const heading = `## [${version}] - `
  const start = changelog.indexOf(heading)
  if (start < 0) fail(`CHANGELOG.md has no ${version} section`)
  const bodyStart = changelog.indexOf('\n', start) + 1
  const end = changelog.indexOf('\n## [', bodyStart)
  return changelog.slice(bodyStart, end < 0 ? undefined : end).trim()
}

function publish() {
  const packageJson = readJson(resolve(root, 'package.json'))
  const version = packageJson.version
  parseVersion(version)
  const tag = `v${version}`

  if (git('status', '--porcelain')) fail('publishing requires a clean git tree')
  const taggedCommit = git('rev-list', '-n', '1', tag)
  const head = git('rev-parse', 'HEAD')
  if (!taggedCommit || taggedCommit !== head)
    fail(`${tag} must exist and point at HEAD`)

  const required = [
    'ALMA_RELEASE_STORE_FILE',
    'ALMA_RELEASE_STORE_PASSWORD',
    'ALMA_RELEASE_KEY_ALIAS',
    'ALMA_RELEASE_KEY_PASSWORD',
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length)
    fail(`missing signing environment variables: ${missing.join(', ')}`)

  if (dryRun) {
    console.log('[dry-run] npm run check')
    console.log('[dry-run] npm run android:release')
    console.log(
      `[dry-run] apksigner verify --verbose --print-certs <release APK>`,
    )
    console.log(
      `[dry-run] create ${tag} draft release with APK, checksum, and changelog notes`,
    )
    return
  }

  run('npm', ['run', 'check'])
  run('npm', ['run', 'android:release'])

  const sourceApk = findReleaseApk()
  const apksigner = findApksigner()
  run(apksigner, ['verify', '--verbose', '--print-certs', sourceApk])

  const temp = mkdtempSync(join(tmpdir(), 'alma-android-release-'))
  try {
    const apkName = `alma-android-${tag}.apk`
    const apkPath = join(temp, apkName)
    const checksumPath = `${apkPath}.sha256`
    const notesPath = join(temp, `${tag}-notes.md`)
    cpSync(sourceApk, apkPath)
    const digest = createHash('sha256')
      .update(readFileSync(apkPath))
      .digest('hex')
    writeFileSync(checksumPath, `${digest}  ${basename(apkPath)}\n`)
    writeFileSync(notesPath, `${changelogNotes(version)}\n`)

    run('gh', [
      'release',
      'create',
      tag,
      '--draft',
      '--verify-tag',
      '--title',
      tag,
      '--notes-file',
      notesPath,
      apkPath,
      checksumPath,
    ])
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

assertRepository()

if (command === 'publish' && commandArgs.length === 1) publish()
else if (command && commandArgs.length === 1) prepare(command)
else {
  console.error('Usage: node scripts/release.mjs <version> [--dry-run]')
  console.error('       node scripts/release.mjs publish [--dry-run]')
  process.exit(1)
}
