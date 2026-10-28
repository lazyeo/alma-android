import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const sdkRoot =
  process.env.ANDROID_HOME || join(homedir(), 'Library/Android/sdk')
const adb = join(sdkRoot, 'platform-tools/adb')
const serialArgs = process.env.ANDROID_SERIAL
  ? ['-s', process.env.ANDROID_SERIAL]
  : []
const apk = 'android/app/build/outputs/apk/debug/app-debug.apk'

function run(args) {
  const result = spawnSync(adb, [...serialArgs, ...args], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['install', '-r', apk])
run(['shell', 'am', 'start', '-n', 'club.a_dobe.alma/.MainActivity'])
