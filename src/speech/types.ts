// Voice input engine model. Engines are data; the native Speech plugin does
// the I/O and owns the API keys, so nothing here ever holds a secret.

export type EngineKind = 'soniox-rt' | 'openai-compat'

export interface EngineConfig {
  /** Stable id; native stores and binds the key under this id. */
  id: string
  kind: EngineKind
  /** Provider name shown in the picker and on the dictation sheet. */
  label: string
  /** https/wss endpoint root; the key is bound to its host when saved. */
  baseUrl: string
  model: string
  /** Models offered in Settings; the first one is the preset default. */
  models: readonly string[]
  /** Set for the user-defined endpoint, whose base URL and model are editable. */
  custom?: boolean
}

export type DictationErrorKind =
  | 'needs_key'
  | 'mic_denied'
  | 'auth'
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'server'
  | 'bad_request'
  | 'host_not_allowed'
  | 'busy'
  | 'empty'
  | 'unknown'

export interface DictationError {
  kind: DictationErrorKind
  /** Provider or transport detail, shown only as a muted secondary line. */
  detail?: string
}
