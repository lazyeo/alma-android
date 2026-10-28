import { useSyncExternalStore } from 'react'

let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function start() {
  if (timer || !listeners.size) return
  timer = setInterval(() => {
    now = Date.now()
    listeners.forEach((listener) => listener())
  }, 1000)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useSharedSecond(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribe : () => () => undefined,
    () => now,
    () => now,
  )
}
