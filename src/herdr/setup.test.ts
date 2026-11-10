import { describe, expect, it } from 'vitest'
import { herdrSetupAction, parseHerdrSetup } from './setup'

describe('Herdr setup state', () => {
  it('parses the phase and the last failure', () => {
    expect(
      parseHerdrSetup({ online: false, phase: 'stopped', error: ' boom ' }),
    ).toEqual({ online: false, phase: 'stopped', error: 'boom' })
    expect(parseHerdrSetup({ online: true, phase: 'later' })).toBeUndefined()
    expect(parseHerdrSetup(null)).toBeUndefined()
  })

  it('offers install when Herdr Core is missing and start when it is installed', () => {
    expect(herdrSetupAction({ online: false, phase: 'missing' })).toBe(
      'install',
    )
    expect(herdrSetupAction({ online: false, phase: 'stopped' })).toBe('start')
    expect(herdrSetupAction({ online: false, phase: 'installing' })).toBe(
      'busy',
    )
    expect(herdrSetupAction({ online: false, phase: 'starting' })).toBe('busy')
  })

  it('offers nothing while Herdr is online or setup is unavailable', () => {
    // An online Herdr reports "stopped" or even "missing" (legacy socket).
    expect(herdrSetupAction({ online: true, phase: 'stopped' })).toBe('none')
    expect(herdrSetupAction({ online: true, phase: 'missing' })).toBe('none')
    expect(herdrSetupAction({ online: false, phase: 'unsupported' })).toBe(
      'none',
    )
    expect(herdrSetupAction(undefined)).toBe('none')
  })
})
