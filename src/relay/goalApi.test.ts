import { expect, it, vi } from 'vitest'
import { AlmaApi } from './almaApi'
it('reads, edits, creates and clears goals through the documented contract', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ goal: null, active: false }),
    text: async () => '',
  })
  const api = new AlmaApi({ fetch, openWebSocket: vi.fn() })
  await api.getGoal('a/b')
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/threads/a%2Fb/goal',
    expect.objectContaining({ method: 'GET' }),
  )
  await api.setGoal('a', '  Finish  ', { edit: true })
  expect(JSON.parse(fetch.mock.calls.at(-1)![1].body)).toEqual({
    condition: 'Finish',
    edit: true,
  })
  await api.setGoal('a', 'New goal', { model: 'provider:model' })
  expect(JSON.parse(fetch.mock.calls.at(-1)![1].body)).toEqual({
    condition: 'New goal',
    model: 'provider:model',
  })
  await api.setGoal('a', 'New goal', { paused: true })
  expect(JSON.parse(fetch.mock.calls.at(-1)![1].body)).toEqual({
    condition: 'New goal',
    paused: true,
  })
  const calls = fetch.mock.calls.length
  await expect(api.setGoal('a', ' ')).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(calls)
  await api.clearGoal('a')
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/threads/a/goal',
    expect.objectContaining({ method: 'DELETE' }),
  )
})
