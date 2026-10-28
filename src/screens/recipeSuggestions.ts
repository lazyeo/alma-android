import type { RealtimeEvent } from '../relay'
import { en } from '../i18n/en'
import { t } from '../i18n/runtime'

export interface RecipeSlot {
  key: string
  label: string
  filled: boolean
}

export interface RecipeSuggestion {
  id: string
  title: string
  description: string
  slots: RecipeSlot[]
  extractPrompt: string
  recipeState?: 'dismissed' | 'extracted'
}

export interface RecipeResponse {
  threadId: string
  open: RecipeSuggestion[]
  all: RecipeSuggestion[]
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value.trim())

export function parseRecipe(value: unknown): RecipeSuggestion | undefined {
  if (!value || typeof value !== 'object') return undefined
  const recipe = value as Record<string, unknown>
  if (
    !nonEmpty(recipe.id) ||
    !nonEmpty(recipe.title) ||
    typeof recipe.description !== 'string' ||
    !nonEmpty(recipe.extractPrompt) ||
    !Array.isArray(recipe.slots)
  )
    return undefined

  const slots = recipe.slots.flatMap((value): RecipeSlot[] => {
    if (!value || typeof value !== 'object') return []
    const slot = value as Record<string, unknown>
    return nonEmpty(slot.key) && nonEmpty(slot.label)
      ? [{ key: slot.key, label: slot.label, filled: slot.filled === true }]
      : []
  })

  const recipeState =
    recipe.recipeState === 'dismissed' || recipe.recipeState === 'extracted'
      ? recipe.recipeState
      : undefined

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    slots,
    extractPrompt: recipe.extractPrompt,
    ...(recipeState ? { recipeState } : {}),
  }
}

export function recipeLabel(id: string): string | undefined {
  return id in en.message.recipe.kinds
    ? t(`message.recipe.kinds.${id as keyof typeof en.message.recipe.kinds}`)
    : undefined
}

export function parseRecipeResponse(value: unknown): RecipeResponse {
  if (!value || typeof value !== 'object')
    return { threadId: '', open: [], all: [] }
  const response = value as Record<string, unknown>
  const parseList = (items: unknown) =>
    Array.isArray(items)
      ? items.flatMap((item) => {
          const recipe = parseRecipe(item)
          return recipe ? [recipe] : []
        })
      : []
  return {
    threadId: typeof response.threadId === 'string' ? response.threadId : '',
    open: parseList(response.open),
    all: parseList(response.all),
  }
}

export interface RecipeSuggestionState {
  recipe?: RecipeSuggestion
  turnShown?: number
  actedTurn?: number
}

export const initialRecipeSuggestionState: RecipeSuggestionState =
  Object.freeze({})

export type RecipeSuggestionAction =
  | { type: 'ready'; turn: number; recipe: RecipeSuggestion }
  | { type: 'loaded'; turn: number; recipe: RecipeSuggestion }
  | { type: 'acted' }
  | { type: 'restore'; recipe: RecipeSuggestion }
  | { type: 'reload' }
  | { type: 'reset' }

/**
 * Recipe banners are turn results, not a backlog. Opening a thread may show
 * the first still-open recipe once (so one produced while the app was away
 * isn't lost); after any recipe was shown or acted on, loads are ignored so
 * the next backlog item never pops up in its place. One ready event may
 * display per turn; acting on it suppresses siblings until a later turn.
 */
export function reduceRecipeSuggestion(
  state: RecipeSuggestionState,
  action: RecipeSuggestionAction,
): RecipeSuggestionState {
  if (action.type === 'reset') return initialRecipeSuggestionState
  if (action.type === 'reload') return state
  if (action.type === 'acted') {
    if (!state.recipe) return state
    return {
      turnShown: state.turnShown,
      actedTurn: state.turnShown,
    }
  }
  if (action.type === 'restore') return { ...state, recipe: action.recipe }
  if (action.type === 'loaded') {
    if (state.turnShown !== undefined || state.actedTurn !== undefined)
      return state
    return { recipe: action.recipe, turnShown: action.turn }
  }
  if (
    state.turnShown === action.turn ||
    (state.actedTurn !== undefined && action.turn <= state.actedTurn + 1)
  )
    return state
  return { recipe: action.recipe, turnShown: action.turn }
}

export function recipeFromReadyEvent(
  threadId: string,
  event: RealtimeEvent,
): RecipeSuggestion | undefined {
  if (event.type !== 'recipe_ready' || event.data?.threadId !== threadId)
    return undefined
  return parseRecipe(event.data.recipe)
}
