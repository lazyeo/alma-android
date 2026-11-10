import { useSyncExternalStore } from 'react'

/**
 * App-wide voice playback: one voice at a time, like any messenger. Hosts
 * read the active path to keep a playing row mounted while the user scrolls,
 * so only leaving the thread (unmount) stops it.
 */
let playing: { element: HTMLAudioElement; path: string } | null = null
// The capsule the user tapped last; a slower download that lands later must
// not take over from it.
let latestRequest: object | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function requestVoicePlayback(owner: object) {
  latestRequest = owner
}

export function isLatestVoiceRequest(owner: object) {
  return latestRequest === owner
}

export function claimVoicePlayback(element: HTMLAudioElement, path: string) {
  if (playing?.element === element) return
  const previous = playing?.element
  playing = { element, path }
  previous?.pause()
  notify()
}

export function releaseVoicePlayback(element: HTMLAudioElement | null) {
  if (!element || playing?.element !== element) return
  playing = null
  notify()
}

export function forgetVoiceRequest(owner: object) {
  if (latestRequest === owner) latestRequest = null
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const activePath = () => playing?.path

/** The gallery path of the voice playing right now, if any. */
export function useActiveVoicePath() {
  return useSyncExternalStore(subscribe, activePath, activePath)
}
