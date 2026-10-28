import { describe, expect, it } from 'vitest'
import {
  initialRecipeSuggestionState,
  parseRecipe,
  parseRecipeResponse,
  recipeLabel,
  reduceRecipeSuggestion,
  recipeFromReadyEvent,
} from './recipeSuggestions'

const valid = {
  id: 'recipe-1',
  title: 'Release checklist',
  description: 'Packages a repeatable release flow.',
  slots: [
    { key: 'project', label: 'Project', filled: true },
    { key: 'channel', label: 'Channel', filled: false },
  ],
  extractPrompt: 'Extract this release flow into a reusable task.',
}

describe('recipe suggestions', () => {
  it('parses the desktop recipe response and preserves filled slots', () => {
    expect(
      parseRecipeResponse({
        threadId: 'thread-1',
        open: [valid],
        all: [valid],
      }),
    ).toEqual({ threadId: 'thread-1', open: [valid], all: [valid] })
  })

  it('drops malformed recipes without selecting one during thread load', () => {
    const parsed = parseRecipeResponse({
      threadId: 'thread-1',
      open: [{ ...valid, extractPrompt: '' }, valid],
      all: [null, valid],
    })

    expect(parsed.open).toEqual([valid])
    expect(parseRecipe({ id: 'broken' })).toBeUndefined()
    expect(initialRecipeSuggestionState.recipe).toBeUndefined()
  })

  it('accepts recipe_ready only for the open thread', () => {
    expect(
      recipeFromReadyEvent('thread-1', {
        type: 'recipe_ready',
        data: { threadId: 'thread-1', recipe: valid },
      }),
    ).toEqual(valid)
    expect(
      recipeFromReadyEvent('thread-2', {
        type: 'recipe_ready',
        data: { threadId: 'thread-1', recipe: valid },
      }),
    ).toBeUndefined()
  })

  it('shows at most one recipe from the current completed turn', () => {
    const ready = reduceRecipeSuggestion(initialRecipeSuggestionState, {
      type: 'ready',
      turn: 4,
      recipe: valid,
    })
    expect(ready.recipe).toEqual(valid)
    expect(
      reduceRecipeSuggestion(ready, {
        type: 'ready',
        turn: 4,
        recipe: { ...valid, id: 'recipe-2' },
      }),
    ).toBe(ready)
  })

  it('suppresses the turn immediately after extraction and shows the next one', () => {
    const ready = reduceRecipeSuggestion(initialRecipeSuggestionState, {
      type: 'ready',
      turn: 4,
      recipe: valid,
    })
    const acted = reduceRecipeSuggestion(ready, { type: 'acted' })
    expect(acted.recipe).toBeUndefined()
    expect(
      reduceRecipeSuggestion(acted, {
        type: 'ready',
        turn: 5,
        recipe: { ...valid, id: 'extraction-turn' },
      }),
    ).toBe(acted)
    expect(
      reduceRecipeSuggestion(acted, {
        type: 'ready',
        turn: 6,
        recipe: { ...valid, id: 'later-turn' },
      }).recipe?.id,
    ).toBe('later-turn')
  })

  it('applies the same next-turn cooldown after dismiss', () => {
    const dismissed = reduceRecipeSuggestion(
      reduceRecipeSuggestion(initialRecipeSuggestionState, {
        type: 'ready',
        turn: 2,
        recipe: valid,
      }),
      { type: 'acted' },
    )

    expect(
      reduceRecipeSuggestion(dismissed, {
        type: 'ready',
        turn: 3,
        recipe: { ...valid, id: 'dismiss-follow-up' },
      }),
    ).toBe(dismissed)
    expect(
      reduceRecipeSuggestion(dismissed, {
        type: 'ready',
        turn: 4,
        recipe: { ...valid, id: 'dismiss-later' },
      }).recipe?.id,
    ).toBe('dismiss-later')
  })

  it('shows one open recipe on thread open, then waits for a later turn', () => {
    const loaded = reduceRecipeSuggestion(initialRecipeSuggestionState, {
      type: 'loaded',
      turn: 0,
      recipe: valid,
    })
    expect(loaded.recipe).toEqual(valid)
    const acted = reduceRecipeSuggestion(loaded, { type: 'acted' })
    expect(acted.recipe).toBeUndefined()
    // A second load (e.g. resync) never surfaces the next backlog item.
    expect(
      reduceRecipeSuggestion(acted, {
        type: 'loaded',
        turn: 0,
        recipe: { ...valid, id: 'backlog' },
      }),
    ).toBe(acted)
    expect(
      reduceRecipeSuggestion(acted, {
        type: 'ready',
        turn: 1,
        recipe: { ...valid, id: 'next-turn' },
      }),
    ).toBe(acted)
    expect(
      reduceRecipeSuggestion(acted, {
        type: 'ready',
        turn: 2,
        recipe: { ...valid, id: 'later-turn' },
      }).recipe?.id,
    ).toBe('later-turn')
  })

  it('a late thread-open load does not replace a live ready recipe', () => {
    const ready = reduceRecipeSuggestion(initialRecipeSuggestionState, {
      type: 'ready',
      turn: 1,
      recipe: { ...valid, id: 'live' },
    })
    expect(
      reduceRecipeSuggestion(ready, { type: 'loaded', turn: 1, recipe: valid }),
    ).toBe(ready)
  })

  it('derives compact English labels for known recipe ids', () => {
    expect(recipeLabel('repeatable-doc-task')).toBe('Repeatable task')
    expect(recipeLabel('thread-to-workflow')).toBe('Conversation → workflow')
    expect(recipeLabel('mcp-pipeline')).toBe('MCP flow')
    expect(recipeLabel('unknown-recipe')).toBeUndefined()
  })

  it('preserves recipe state metadata for prior extraction counts', () => {
    const parsed = parseRecipeResponse({
      threadId: 'thread-1',
      open: [valid],
      all: [
        { ...valid, recipeState: 'extracted' },
        { ...valid, id: 'dismissed', recipeState: 'dismissed' },
      ],
    })

    expect(parsed.all[0].recipeState).toBe('extracted')
    expect(parsed.all[1].recipeState).toBe('dismissed')
  })

  it('does not restore any open recipe on reload', () => {
    const acted = reduceRecipeSuggestion(
      reduceRecipeSuggestion(initialRecipeSuggestionState, {
        type: 'ready',
        turn: 2,
        recipe: valid,
      }),
      { type: 'acted' },
    )
    expect(reduceRecipeSuggestion(acted, { type: 'reload' })).toEqual(acted)
  })
})
