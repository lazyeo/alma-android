// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useAfterNextRender } from './useAfterNextRender'

describe('useAfterNextRender', () => {
  it('runs with the state of the render that follows the update', () => {
    const seen: string[] = []
    const { result } = renderHook(() => {
      const [text, setText] = useState('')
      const afterRender = useAfterNextRender()
      // The way a composer exposes its render-bound send.
      const sendRef = useRef(() => seen.push(text))
      sendRef.current = () => seen.push(text)
      return { setText, afterRender, sendRef }
    })
    act(() => {
      result.current.setText('dictated')
      result.current.afterRender(() => result.current.sendRef.current())
    })
    expect(seen).toEqual(['dictated'])
  })
})
