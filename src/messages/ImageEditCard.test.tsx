// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ImageEditCard } from './ImageEditCard'

afterEach(cleanup)

it('renders colored numbered requests and the overall note', () => {
  render(
    <ImageEditCard
      request={{
        regions: [
          { index: 1, color: '#ef4444', label: 'Move the button' },
          { index: 2, color: '#06b6d4' },
        ],
        note: 'Keep the card compact.',
      }}
    />,
  )
  expect(screen.getByText('Image edit')).toBeTruthy()
  expect(screen.getByText('Move the button')).toBeTruthy()
  expect(screen.getByText('Keep the card compact.')).toBeTruthy()
})
