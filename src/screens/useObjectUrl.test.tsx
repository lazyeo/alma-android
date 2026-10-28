// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useObjectUrl } from './useObjectUrl'
it('revokes replaced and unmounted URLs and recreates a URL on back navigation', () => {
  URL.createObjectURL = vi
    .fn()
    .mockReturnValueOnce('blob:a')
    .mockReturnValueOnce('blob:b')
    .mockReturnValueOnce('blob:c')
  URL.revokeObjectURL = vi.fn()
  const first = new Blob(['a'])
  const { result, rerender, unmount } = renderHook(
    ({ blob }) => useObjectUrl(blob),
    { initialProps: { blob: first } },
  )
  expect(result.current).toBe('blob:a')
  rerender({ blob: new Blob(['b']) })
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a')
  rerender({ blob: first })
  expect(result.current).toBe('blob:c')
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:c')
})
