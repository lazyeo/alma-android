import { SquareTerminal } from 'lucide-react'
import { useT } from '../i18n'
import { useLayoutMode } from '../layout/useLayoutMode'
import { AgentsScreen } from './AgentsScreen'

export function AgentsListRoute() {
  const t = useT()
  const mode = useLayoutMode()
  if (mode === 'single') return <AgentsScreen />
  return (
    <section className="split-start agents-empty-detail">
      <SquareTerminal size={24} aria-hidden="true" />
      <p>{t('agents.selectSession')}</p>
    </section>
  )
}
