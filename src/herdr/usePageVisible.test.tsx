// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { usePageVisible } from './usePageVisible'

const originalVisibility = Object.getOwnPropertyDescriptor(
  document,
  'visibilityState',
)

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  if (originalVisibility)
    Object.defineProperty(document, 'visibilityState', originalVisibility)
  else delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
})

it('tracks whether the page is visible', () => {
  setVisibility('visible')
  const { result } = renderHook(() => usePageVisible())
  expect(result.current).toBe(true)

  act(() => setVisibility('hidden'))
  expect(result.current).toBe(false)

  act(() => setVisibility('visible'))
  expect(result.current).toBe(true)
})
