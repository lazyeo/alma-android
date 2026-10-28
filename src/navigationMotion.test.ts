import { describe, expect, it } from 'vitest'
import { decideNavigationMotion } from './navigationMotion'

const location = (pathname: string, search = '', state: unknown = null) => ({
  pathname,
  search,
  hash: '',
  state,
  key: pathname,
})

describe('navigation motion', () => {
  it('pushes from the project list into a project thread', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/threads', '?project=p-1'),
        location('/d/home/threads/t-1', '?project=p-1'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('push')
  })

  it('pushes into GTD conversations and fades between Threads and GTD', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/gtd'),
        location('/d/home/gtd/t-1'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('push')
    expect(
      decideNavigationMotion(
        location('/d/home/gtd/t-1'),
        location('/d/home/gtd'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('pop')
    expect(
      decideNavigationMotion(
        location('/d/home/threads'),
        location('/d/home/gtd'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('fade')
    expect(
      decideNavigationMotion(
        location('/d/home/gtd/t-1'),
        location('/d/home/gtd/t-2'),
        'PUSH',
        null,
        'split',
      ),
    ).toBe('fade')
  })

  it('uses shared-axis push and pop for hierarchy changes', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/threads'),
        location('/d/home/threads/t-1'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('push')
    expect(
      decideNavigationMotion(
        location('/d/home/threads/t-1'),
        location('/d/home/threads'),
        'POP',
        -1,
        'single',
      ),
    ).toBe('pop')
    expect(
      decideNavigationMotion(
        location('/d/home/crystals'),
        location('/d/home/crystals/c-1'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('push')
    expect(
      decideNavigationMotion(
        location('/settings'),
        location('/pair'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('push')
  })

  it('mirrors explicit parent navigation even when it creates a PUSH entry', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/threads/t-1'),
        location('/d/home/threads'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('pop')
  })

  it('crossfades tab siblings, split-pane thread replacement, and desktop switches', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/threads'),
        location('/inbox'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('fade')
    expect(
      decideNavigationMotion(
        location('/inbox'),
        location('/settings'),
        'PUSH',
        null,
        'single',
      ),
    ).toBe('fade')
    expect(
      decideNavigationMotion(
        location('/d/home/threads/t-1'),
        location('/d/home/threads/t-2'),
        'PUSH',
        null,
        'split',
      ),
    ).toBe('fade')
    expect(
      decideNavigationMotion(
        location('/d/home/threads'),
        location('/d/work/threads'),
        'PUSH',
        null,
        'split',
      ),
    ).toBe('fade')
  })

  it('does not animate replacements, initial redirects, or same-page state changes', () => {
    expect(
      decideNavigationMotion(
        location('/threads'),
        location('/d/home/threads'),
        'REPLACE',
        null,
        'single',
      ),
    ).toBe('none')
    expect(
      decideNavigationMotion(
        location('/d/home/threads/t-1'),
        location('/d/home/threads/t-1', '', { pendingGoal: true }),
        'REPLACE',
        null,
        'single',
      ),
    ).toBe('none')
    expect(
      decideNavigationMotion(
        location('/d/home/threads/t-1'),
        location('/d/home/threads/t-2'),
        'REPLACE',
        null,
        'split',
      ),
    ).toBe('none')
  })

  it('allows the first-send shared composer as the only animated replacement', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/threads', '?new=1'),
        location('/d/home/threads/t-new', '', {
          navigationMotion: 'shared-composer',
        }),
        'REPLACE',
        null,
        'single',
      ),
    ).toBe('shared-composer')
  })

  it('uses POP delta as the source of truth for header and hardware back', () => {
    expect(
      decideNavigationMotion(
        location('/d/home/threads/t-1'),
        location('/d/home/threads'),
        'POP',
        -1,
        'single',
      ),
    ).toBe('pop')
    expect(
      decideNavigationMotion(
        location('/inbox'),
        location('/d/home/threads'),
        'POP',
        -1,
        'single',
      ),
    ).toBe('pop')
    expect(
      decideNavigationMotion(
        location('/d/home/threads'),
        location('/inbox'),
        'POP',
        1,
        'single',
      ),
    ).toBe('push')
  })
})
