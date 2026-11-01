import { useT } from '../i18n'
import { HerdrMark } from './HerdrMark'
import { useLayoutMode } from '../layout/useLayoutMode'
import { AgentsScreen } from './AgentsScreen'

export function AgentsListRoute() {
  const t = useT()
  const mode = useLayoutMode()
  if (mode === 'single') return <AgentsScreen />
  return (
    <section className="split-start agents-empty-detail">
      <HerdrMark size={24} />
      <p>{t('agents.selectSession')}</p>
    </section>
  )
}
