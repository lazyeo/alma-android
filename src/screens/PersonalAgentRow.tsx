import { Fragment } from 'react'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  personalAgentSubtitle,
  type PersonalAgentState,
} from './personalAgent'

export type PersonalAgentRowState = PersonalAgentState

/** Alma's main conversation, pinned above the thread list (desktop 0.4.407+). */
export function PersonalAgentRow({
  state,
  onOpen,
}: {
  state: PersonalAgentRowState
  onOpen(threadId: string): void
}) {
  const t = useT()
  // Older desktops, first load, and failed loads show no row rather than a
  // placeholder: the entry is an accessory, the thread list stays primary.
  if (state.status !== 'ready') return null
  const { personal } = state
  // Our own glasses launcher character (copied from the Android round icon);
  // the older /icon-192.png web icon predates the glasses redesign.
  const icon = (
    <span className="personal-agent-icon" aria-hidden="true">
      <img src="/alma-glasses-192.png" alt="" />
    </span>
  )
  const title = <h2>{t('threads.personal.title')}</h2>
  if (!personal.threadId)
    return (
      <div className="thread-row personal-agent-row unset">
        {icon}
        <div className="thread-copy">
          {title}
          <p className="personal-agent-subtitle">
            {t('threads.personal.notSetUp')}
          </p>
        </div>
      </div>
    )
  const threadId = personal.threadId
  const parts = personalAgentSubtitle(personal, state.vitals?.mood, t)
  return (
    <button
      type="button"
      className="thread-row personal-agent-row"
      aria-label={t('threads.personal.open')}
      onClick={() => {
        void haptic('light')
        onOpen(threadId)
      }}
    >
      {icon}
      <div className="thread-copy">
        {title}
        {parts.length ? (
          <p className="personal-agent-subtitle">
            {parts.map((part, index) => (
              <Fragment key={part.kind}>
                {index ? ', ' : null}
                {part.emphasized ? <strong>{part.text}</strong> : part.text}
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>
    </button>
  )
}
