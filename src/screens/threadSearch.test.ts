import { expect, it } from 'vitest'
import {
  searchSnippet,
  highlightQuery,
  parseThreadSearch,
} from './threadSearch'
it('strips markdown and centers a bounded snippet around a literal match', () => {
  const text =
    'before '.repeat(30) +
    '**Needle** [label](https://example.test) ' +
    'after '.repeat(30)
  const snippet = searchSnippet(text, 'needle')
  expect(snippet).toContain('Needle label')
  expect(snippet.length).toBeLessThanOrEqual(124)
  expect(snippet).not.toContain('**')
  expect(snippet).not.toContain('https:')
})
it('highlights all case-insensitive literal matches without regex or HTML injection', () => {
  expect(
    highlightQuery('<b>A+B a+b</b>', 'a+b')
      .filter((p) => p.match)
      .map((p) => p.text),
  ).toEqual(['A+B', 'a+b'])
  expect(highlightQuery('hello', '')).toEqual([{ text: 'hello', match: false }])
})
it('normalizes message matches and keeps row IDs and total count', () => {
  expect(
    parseThreadSearch([
      {
        id: 't1',
        title: 'Title',
        matches: [
          { id: 'r1', content: '**needle**' },
          { id: 'r2', content: 'needle again' },
          { id: 'r3', content: 'third' },
        ],
      },
    ])[0],
  ).toMatchObject({
    id: 't1',
    count: 3,
    snippets: [
      { rowId: 'r1', text: '**needle**' },
      { rowId: 'r2', text: 'needle again' },
    ],
  })
  expect(parseThreadSearch({ unexpected: true })).toEqual([])
})
it('uses desktop context rows but shows only matching text parts', () => {
  expect(
    parseThreadSearch(
      [
        {
          id: 't',
          title: 'A title',
          matchCount: 8,
          messages: [
            {
              id: 'context',
              message: { parts: [{ type: 'text', text: 'unrelated' }] },
            },
            {
              id: 'match',
              message: {
                parts: [
                  { type: 'text', text: 'A **layout** decision' },
                  { type: 'tool-call', text: 'private tool output' },
                ],
              },
            },
          ],
        },
      ],
      'layout',
    ),
  ).toEqual([
    {
      id: 't',
      title: 'A title',
      count: 8,
      snippets: [{ rowId: 'match', text: 'A **layout** decision' }],
    },
  ])
})
it('does not expose incognito or child search results', () => {
  expect(
    parseThreadSearch([
      { id: 'secret', isIncognito: true },
      { id: 'child', parentThreadId: 'parent' },
    ]),
  ).toEqual([])
})
