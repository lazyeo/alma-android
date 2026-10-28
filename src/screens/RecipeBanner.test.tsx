// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecipeBanner } from './RecipeBanner'
import type { RecipeSuggestion } from './recipeSuggestions'

const recipe: RecipeSuggestion = {
  id: 'thread-to-workflow',
  title: 'Turn this conversation into a workflow',
  description: 'Extract the repeated steps.',
  slots: [{ key: 'thread', label: 'Conversation', filled: true }],
  extractPrompt: 'Extract this conversation into a workflow.',
}

const renderBanner = (value = recipe, extractedCount = 0) =>
  render(
    <RecipeBanner
      recipe={value}
      extractedCount={extractedCount}
      busy={false}
      onExtract={vi.fn()}
      onDismiss={vi.fn()}
    />,
  )

afterEach(cleanup)

describe('RecipeBanner clarity', () => {
  it('shows the known recipe type and prior extraction count', () => {
    renderBanner(recipe, 2)

    expect(screen.getByText('Conversation → workflow')).toBeTruthy()
    expect(
      screen.getByText('2 objects already extracted from this conversation'),
    ).toBeTruthy()
  })

  it('hides the type label and prior line when unavailable', () => {
    renderBanner({ ...recipe, id: 'unknown-recipe' })

    expect(screen.queryByText('Conversation → workflow')).toBeNull()
    expect(screen.queryByText(/already extracted/)).toBeNull()
  })
})
