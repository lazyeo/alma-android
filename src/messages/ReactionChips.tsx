import { useRef } from 'react'
import { useT } from '../i18n'
import {
  QUICK_REACTIONS,
  isOwnReaction,
  type MessageReaction,
} from '../screens/messageReactions'

/**
 * Emoji reactions under a message. The desktop keeps one entry per emoji, so
 * there is never a count to show. Only the user's own chips are buttons
 * (tap to remove), and only when the host can send reactions.
 */
export function ReactionChips({
  reactions,
  onToggle,
}: {
  reactions: MessageReaction[]
  onToggle?: (emoji: string) => void
}) {
  const t = useT()
  // Chips already there at mount are history; only ones that arrive while
  // the row is on screen animate in, so a virtualized row scrolled back into
  // view does not replay the entrance.
  const atMount = useRef<ReadonlySet<string>>(undefined)
  atMount.current ??= new Set(reactions.map((reaction) => reaction.emoji))
  if (!reactions.length) return null
  return (
    <div
      className="message-reactions"
      role="group"
      aria-label={t('message.reactions.label')}
      data-preview-omit=""
    >
      {reactions.map(({ emoji, by }) => {
        const own = by === 'user'
        const className = `reaction-chip${own ? ' own' : ''}${atMount.current?.has(emoji) ? '' : ' entering'}`
        return own && onToggle ? (
          <button
            key={emoji}
            type="button"
            className={className}
            aria-pressed="true"
            aria-label={t('message.reactions.remove', { emoji })}
            onClick={() => onToggle(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        ) : (
          <span
            key={emoji}
            className={className}
            role="img"
            aria-label={t(
              own ? 'message.reactions.yours' : 'message.reactions.alma',
              { emoji },
            )}
          >
            {emoji}
          </span>
        )
      })}
    </div>
  )
}

/** The message sheet's quick row; tapping toggles the user's reaction. */
export function QuickReactions({
  reactions,
  onToggle,
}: {
  reactions: MessageReaction[]
  onToggle: (emoji: string) => void
}) {
  const t = useT()
  return (
    <div
      className="quick-reactions"
      role="group"
      aria-label={t('message.reactions.quick')}
    >
      {QUICK_REACTIONS.map((emoji) => {
        const own = isOwnReaction(reactions, emoji)
        return (
          <button
            key={emoji}
            type="button"
            className={own ? 'own' : undefined}
            aria-pressed={own}
            aria-label={t(
              own ? 'message.reactions.remove' : 'message.reactions.add',
              { emoji },
            )}
            onClick={() => onToggle(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        )
      })}
    </div>
  )
}
