export const THREAD_OVERSCAN = 5
export const STAGED_THREAD_OVERSCAN = 1

export function initialThreadOverscan(fromSearch: boolean) {
  return fromSearch ? THREAD_OVERSCAN : STAGED_THREAD_OVERSCAN
}
