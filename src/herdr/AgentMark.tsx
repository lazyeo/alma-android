import { Bot } from 'lucide-react'

const CLAUDE_CODE =
  'M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z'
const PI = [
  'M165.29 165.29H517.36V400H400V282.65H165.29Z',
  'M165.29 282.65H282.65V400H400V517.36H282.65V634.72H165.29Z',
  'M517.36 400H634.72V634.72H517.36Z',
]
const AGENT_COLORS = {
  claude: '#D97757',
  pi: ['#F09082', '#4D9ABF', '#F1BE58'],
} as const

export function AgentMark({
  agent,
  small = false,
  muted = false,
}: {
  agent?: string | null
  small?: boolean
  muted?: boolean
}) {
  const kind = agent?.toLowerCase() ?? 'unknown'
  const box = small ? 14 : 18
  const className = `agent-mark${muted ? ' muted' : ''}`

  if (kind === 'claude')
    return (
      <span
        aria-hidden="true"
        className={className}
        data-agent-mark="claude"
        style={{ width: box, height: box }}
      >
        <svg width={box} height={box} viewBox="0 0 24 24">
          <path
            fill={muted ? 'currentColor' : AGENT_COLORS.claude}
            d={CLAUDE_CODE}
          />
        </svg>
      </span>
    )

  if (kind === 'pi')
    return (
      <span
        aria-hidden="true"
        className={className}
        data-agent-mark="pi"
        style={{ width: box, height: box }}
      >
        <svg width={box} height={box} viewBox="165.29 165.29 469.43 469.43">
          {PI.map((d, index) => (
            <path
              key={d}
              fill={muted ? 'currentColor' : AGENT_COLORS.pi[index]}
              d={d}
            />
          ))}
        </svg>
      </span>
    )

  return (
    <span
      aria-hidden="true"
      className={className}
      data-agent-mark={kind}
      style={{ width: box, height: box }}
    >
      <Bot data-agent-mark="fallback" size={box} strokeWidth={1.8} />
    </span>
  )
}
