import { Check, ChevronDown, FlaskConical, X } from 'lucide-react'
import { useState } from 'react'
import { recipeLabel, type RecipeSuggestion } from './recipeSuggestions'
import { useT } from '../i18n'

export function RecipeBanner({
  recipe,
  extractedCount,
  busy,
  onExtract,
  onDismiss,
}: {
  recipe: RecipeSuggestion
  extractedCount: number
  busy: boolean
  onExtract(): void
  onDismiss(): void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const filled = recipe.slots.filter((slot) => slot.filled)
  const label = recipeLabel(recipe.id)
  return (
    <section className="recipe-banner" aria-label={t('message.recipe.label')}>
      <div className="recipe-banner-main">
        <FlaskConical size={16} strokeWidth={2} aria-hidden="true" />
        <button
          className="recipe-summary"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="recipe-summary-copy">
            {label ? <span className="recipe-type-label">{label}</span> : null}
            <span>
              {t('message.recipe.extractable', { title: recipe.title })}
            </span>
            {extractedCount > 0 ? (
              <span className="recipe-prior-extractions">
                {t('message.recipe.extracted', { count: extractedCount })}
              </span>
            ) : null}
          </span>
          {filled.length ? (
            <ChevronDown
              className={expanded ? 'expanded' : ''}
              size={14}
              aria-hidden="true"
            />
          ) : null}
        </button>
        <button className="recipe-extract" disabled={busy} onClick={onExtract}>
          {t('message.recipe.extract')}
        </button>
        <button
          className="recipe-dismiss"
          aria-label={t('message.recipe.dismiss', { title: recipe.title })}
          disabled={busy}
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      </div>
      {expanded && filled.length ? (
        <ul className="recipe-slots">
          {filled.map((slot) => (
            <li key={slot.key}>
              <Check size={13} strokeWidth={2.4} aria-hidden="true" />
              {slot.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
