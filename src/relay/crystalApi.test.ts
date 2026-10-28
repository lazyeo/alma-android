import { expect, it, vi } from 'vitest'
import { AlmaApi, assertSafePath } from './almaApi'
it('builds exact crystal requests without inventing payloads', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ suggestions: ['Hello'] }),
    text: async () => '',
  })
  const api = new AlmaApi({ fetch, openWebSocket: vi.fn() })
  for (const [action, value, method, body] of [
    ['slot', null, 'POST', { slot: null }],
    ['slot', 2, 'POST', { slot: 2 }],
    ['dormant', true, 'POST', { dormant: true }],
    ['type', 'entity', 'POST', { type: 'entity' }],
    [
      'checklist',
      { field: 'name', value: 'A', sources: ['user:manual'] },
      'PUT',
      { field: 'name', value: 'A', sources: ['user:manual'] },
    ],
    ['prefill', undefined, 'POST', undefined],
    ['validate', undefined, 'GET', undefined],
    ['confirm', undefined, 'POST', undefined],
    ['cancel', undefined, 'POST', undefined],
  ] as const) {
    await api.crystalAction('a/b', action, value)
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/crystal/a%2Fb/${action}`,
      expect.objectContaining({
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    )
  }
  expect(await api.getStartSuggestions()).toEqual(['Hello'])
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/activity-recorder/suggestions',
    expect.objectContaining({ method: 'GET' }),
  )
})
it('restricts activity and crystal routes to exact methods', () => {
  expect(() =>
    assertSafePath('/api/activity-recorder/suggestions', 'POST'),
  ).toThrow()
  expect(() => assertSafePath('/api/activity-recorder/other', 'GET')).toThrow()
  expect(() => assertSafePath('/api/crystal/x/confirm', 'GET')).toThrow()
  expect(() => assertSafePath('/api/crystal/x/unknown', 'POST')).toThrow()
})
it('encodes literal search queries and filters malformed suggestions', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ suggestions: ['Useful', null, 3, ' '] }),
    text: async () => '',
  })
  const api = new AlmaApi({ fetch, openWebSocket: vi.fn() })
  await api.searchThreads('a+b & c')
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/search/threads?q=a%2Bb%20%26%20c',
    expect.objectContaining({ method: 'GET', body: undefined }),
  )
  expect(await api.getStartSuggestions()).toEqual(['Useful'])
  expect(() => assertSafePath('/api/crystal/x', 'DELETE')).toThrow()
  expect(() => assertSafePath('/api/settings', 'PUT')).toThrow()
  expect(() => assertSafePath('/api/providers/p', 'POST')).toThrow()
})
