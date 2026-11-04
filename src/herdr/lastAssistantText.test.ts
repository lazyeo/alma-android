import { describe, expect, it } from 'vitest'
import {
  agentTurnIdentity,
  lastAssistantText,
  pendingAgentQuestion,
} from './lastAssistantText'

describe('lastAssistantText', () => {
  it.each(['user', 'human', 'teammate'])(
    'stops before an older assistant when the newest boundary is %s',
    (kind) => {
      expect(
        lastAssistantText({
          page: {
            items: [
              { id: 'assistant', kind: 'assistant', text: 'Older reply' },
              { id: 'boundary', kind, text: 'Newer message' },
            ],
          },
        }),
      ).toBe('')
    },
  )

  it('keeps the newest assistant text and first-line option', () => {
    const response = {
      page: {
        items: [
          { id: 'user', kind: 'user', text: 'Question' },
          {
            id: 'assistant',
            kind: 'assistant',
            text: 'First line\nSecond line',
          },
          { id: 'tool', kind: 'tool', text: 'Tool output' },
        ],
      },
    }

    expect(lastAssistantText(response)).toBe('First line\nSecond line')
    expect(lastAssistantText(response, true)).toBe('First line')
  })
})

const ask = (
  id: string,
  questions: Array<{ question: string; options: string[] }>,
  done = false,
) => ({
  id,
  kind: 'tool',
  tool: {
    name: 'AskUserQuestion',
    done,
    input: {
      questions: questions.map((entry) => ({
        header: 'Q',
        question: entry.question,
        options: entry.options.map((label) => ({ label })),
      })),
    },
  },
})

describe('pendingAgentQuestion', () => {
  const two = ask('t1', [
    { question: 'Which database?', options: ['Postgres', 'SQLite'] },
    { question: 'Which region?', options: ['Sydney', 'Tokyo'] },
  ])

  it('returns the pending question verbatim', () => {
    const items = [
      ask('t1', [{ question: '  Ship *now*?\nReally? ', options: ['Yes'] }]),
    ]
    expect(pendingAgentQuestion(items)).toBe('Ship *now*?\nReally?')
  })

  it('picks the question whose options are on screen', () => {
    expect(
      pendingAgentQuestion(
        [two],
        ['Sydney  closest', 'Tokyo', 'Type something.'],
      ),
    ).toBe('Which region?')
    expect(pendingAgentQuestion([two], ['Yes', 'No'])).toBe('')
    expect(pendingAgentQuestion([two])).toBe('Which database?')
  })

  it('ignores answered questions and older turns', () => {
    expect(
      pendingAgentQuestion([{ ...two, tool: { ...two.tool, done: true } }]),
    ).toBe('')
    expect(
      pendingAgentQuestion([
        two,
        { id: 'u', kind: 'user', text: 'never mind' },
      ]),
    ).toBe('')
    expect(
      pendingAgentQuestion([
        {
          id: 'b',
          kind: 'tool',
          tool: { name: 'Bash', input: { command: 'ls' } },
        },
      ]),
    ).toBe('')
  })
})

describe('agentTurnIdentity', () => {
  it('identifies blocked by the pending tool and done by the last item', () => {
    const items = [
      { id: 'u1', kind: 'user', text: 'go' },
      { id: 'b1', kind: 'tool', tool: { name: 'Bash', done: true } },
      { id: 'b2', kind: 'tool', tool: { name: 'Bash', done: false } },
    ]
    expect(agentTurnIdentity(items, 'blocked')).toBe('b2')
    expect(agentTurnIdentity(items, 'done')).toBe('b2')
    expect(agentTurnIdentity(items.slice(0, 2), 'blocked')).toBeUndefined()
    expect(agentTurnIdentity([], 'done')).toBeUndefined()
    expect(agentTurnIdentity(items, 'working')).toBeUndefined()
  })
})
