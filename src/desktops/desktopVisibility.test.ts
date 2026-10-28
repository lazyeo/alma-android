import { describe, expect, it } from 'vitest'
import type { PairingStore, StoredPairing } from '../relay'
import {
  canHideDesktop,
  hiddenPairings,
  setDesktopHidden,
  visiblePairings,
} from './desktopVisibility'

const pairing = (id: string, hidden?: boolean): StoredPairing => ({
  id,
  name: id,
  relayUrl: 'https://relay.example',
  connectCode: `${id}-abcdefghijklmnopqrstuvwxyz`,
  addedAt: 1,
  lastActiveAt: 1,
  ...(hidden === undefined ? {} : { hidden }),
})

const store = (...pairings: StoredPairing[]): PairingStore => ({
  pairings,
  activeId: pairings[0]?.id ?? null,
})

describe('desktop visibility', () => {
  it('treats pairings saved before the hidden flag as visible', () => {
    const current = store(pairing('old'), pairing('hidden', true))

    expect(visiblePairings(current.pairings).map(({ id }) => id)).toEqual([
      'old',
    ])
    expect(hiddenPairings(current.pairings).map(({ id }) => id)).toEqual([
      'hidden',
    ])
  })

  it('falls back to the first visible desktop when the active one is hidden', () => {
    const current = store(
      pairing('active'),
      pairing('next'),
      pairing('old', true),
    )

    expect(setDesktopHidden(current, 'active', true)).toMatchObject({
      activeId: 'next',
      pairings: [
        { id: 'active', hidden: true },
        { id: 'next' },
        { id: 'old', hidden: true },
      ],
    })
  })

  it('does not allow hiding the last visible desktop', () => {
    const current = store(pairing('only'), pairing('old', true))

    expect(canHideDesktop(current.pairings, 'only')).toBe(false)
    expect(setDesktopHidden(current, 'only', true)).toBe(current)
  })

  it('unhides a desktop without changing the active desktop', () => {
    const current = store(pairing('active'), pairing('old', true))

    expect(setDesktopHidden(current, 'old', false)).toMatchObject({
      activeId: 'active',
      pairings: [{ id: 'active' }, { id: 'old', hidden: false }],
    })
  })
})
