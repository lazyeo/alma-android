import { useCallback, useEffect, useRef, useState } from 'react'
import { DictationSession, type DictationState } from './dictationSession'
import {
  engineChain,
  engineReady,
  loadSpeechSettings,
  resolveEngine,
} from './engineStore'
import { Speech } from './nativeSpeech'
import type { EngineConfig } from './types'

export interface Dictation {
  state: DictationState
  /** The primary engine as of the last Start (the state names the active one). */
  engine: EngineConfig
  /** Runs the user's chain, or only `engineId` (Settings → Test). */
  start(engineId?: string): void
  stop(): void
  cancel(): void
  reset(): void
}

/**
 * Settings are re-read on every Start, so a change in Settings applies to
 * the next dictation without remounting the composer.
 */
export function useDictation(): Dictation {
  const [state, setState] = useState<DictationState>({ phase: 'idle' })
  const [engine, setEngine] = useState(() =>
    resolveEngine(loadSpeechSettings()),
  )
  const sessionRef = useRef<DictationSession>()
  if (!sessionRef.current)
    sessionRef.current = new DictationSession(
      {
        speech: Speech,
        now: () => Date.now(),
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      },
      setState,
    )
  useEffect(() => {
    const session = sessionRef.current
    return () => session?.dispose()
  }, [])
  const start = useCallback((engineId?: string) => {
    const settings = loadSpeechSettings()
    const chain = engineId
      ? [resolveEngine(settings, engineId)].filter(engineReady)
      : engineChain(settings)
    setEngine(chain[0] ?? resolveEngine(settings, engineId))
    void sessionRef.current?.start(chain, settings.terms)
  }, [])
  const stop = useCallback(() => void sessionRef.current?.stop(), [])
  const cancel = useCallback(() => void sessionRef.current?.cancel(), [])
  const reset = useCallback(() => sessionRef.current?.reset(), [])
  return { state, engine, start, stop, cancel, reset }
}
