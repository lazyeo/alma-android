import { expect, it } from 'vitest'
import {
  reconcileUnread,
  completeUnread,
  readUnread,
  parseUnreadStore,
} from './threadUnread'
it('seeds silently, tracks assistant completions and clears only the opened thread', () => {
  const seeded = reconcileUnread({}, [
    { id: 'a', updatedAt: 100 },
    { id: 'b', updatedAt: 100 },
  ])
  expect(seeded.a.unread).toBe(false)
  const completed = completeUnread(seeded, 'a', 200)
  expect(completed.a.unread).toBe(true)
  expect(completed.b.unread).toBe(false)
  expect(readUnread(completed, 'a').a.unread).toBe(false)
})
it('ignores title-only updates until assistant activity is known and prunes deleted threads', () => {
  let state = reconcileUnread({}, [{ id: 'a', updatedAt: 100 }])
  state = reconcileUnread(state, [{ id: 'a', updatedAt: 200 }])
  expect(state.a.unread).toBe(false)
  state = readUnread(completeUnread(state, 'a', 300), 'a')
  expect(reconcileUnread(state, [{ id: 'a', updatedAt: 400 }]).a.unread).toBe(
    true,
  )
  expect(reconcileUnread(state, [])).toEqual({})
})
it('does not resurrect a read reply when a completion event is replayed', () => {
  const state = readUnread(completeUnread({}, 'a', 200), 'a')
  expect(completeUnread(state, 'a', 200).a.unread).toBe(false)
})
it('drops malformed saved state while preserving valid desktop-scoped entries', () => {
  expect(
    parseUnreadStore(
      '{"d":{"bad":null,"a":{"updated":12,"assistant":true,"unread":false}}}',
    ),
  ).toEqual({
    d: { a: { updated: 12, lastSeenAt: 12, assistant: true, unread: false } },
  })
  expect(parseUnreadStore('invalid')).toEqual({})
})

it('records completion as seen atomically only for an open visible thread', () => {
  const visible = completeUnread({}, 'a', 200, true)
  expect(visible.a).toMatchObject({
    lastSeenAt: 200,
    unread: false,
    assistant: true,
  })
  expect(completeUnread(visible, 'a', 200).a.unread).toBe(false)
  expect(completeUnread(visible, 'a', 300, false).a.unread).toBe(true)
  expect(readUnread(visible, 'a', 400).a.lastSeenAt).toBe(400)
})
it('seeds lastSeenAt and preserves desktop isolation on round trip', () => {
  const a = reconcileUnread({}, [{ id: 'same', updatedAt: 100 }])
  const b = completeUnread({}, 'same', 200)
  const stored = parseUnreadStore(JSON.stringify({ a, b }))
  expect(stored.a.same.lastSeenAt).toBe(100)
  expect(stored.a.same.unread).toBe(false)
  expect(stored.b.same.unread).toBe(true)
})
