import { useT } from '../i18n'
import { useHerdr } from './HerdrProvider'

/**
 * Picks which computer the Herdr page talks to: the paired desktop or one of
 * the other computers it reaches. Hidden while there are none (or the
 * desktop predates the computers route).
 */
export function HerdrComputerSwitcher({ desktopId }: { desktopId: string }) {
  const t = useT()
  const { computers, computerFor, selectComputer, byDesktop } = useHerdr()
  const list = computers(desktopId)
  if (!list?.length) return null
  const selected = computerFor(desktopId)
  const polled = byDesktop[desktopId]?.transport === 'poll'
  return (
    <div className="herdr-computers">
      <div
        className="herdr-computer-switcher"
        role="group"
        aria-label={t('agents.computers.label')}
      >
        <button
          className="chip-button"
          aria-pressed={selected === undefined}
          onClick={() => selectComputer(desktopId, undefined)}
        >
          {t('agents.computers.thisComputer')}
        </button>
        {list.map((computer) => (
          <button
            key={computer.id}
            className="chip-button"
            aria-pressed={selected === computer.id}
            data-state={computer.state}
            onClick={() => selectComputer(desktopId, computer.id)}
          >
            {computer.state === 'ready'
              ? computer.label
              : t('agents.computers.notReady', { name: computer.label })}
          </button>
        ))}
      </div>
      {selected !== undefined && polled ? (
        <p className="herdr-computer-note">{t('agents.computers.polled')}</p>
      ) : null}
    </div>
  )
}
