import { useId } from 'react'
import { Bot } from 'lucide-react'
import { installed } from '@alma/extensions-installed'

const CLAUDE_CODE =
  'M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z'
const CODEX_CLOUD =
  'M4.1 18.65C2.2 17.35 1.2 15.35 1.45 13.25C1.66 11.43 2.75 9.83 4.35 8.94C4.16 6.9 5.12 5.01 6.88 3.99C8.45 3.08 10.4 3.12 11.94 4.06C13.47 2.85 15.67 2.74 17.32 3.82C18.76 4.76 19.54 6.4 19.42 8.08C21.22 8.8 22.49 10.46 22.64 12.4C22.78 14.27 21.9 16.07 20.35 17.14C20.25 19.13 18.95 20.91 17.08 21.62C15.35 22.27 13.42 21.85 12.12 20.58C10.69 21.9 8.56 22.2 6.82 21.31C5.73 20.75 4.91 19.8 4.55 18.68C4.4 18.68 4.25 18.67 4.1 18.65Z'
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
  const id = useId().replace(/:/g, '')
  // Herdr controls `kind`, so only own keys count: `constructor` must not
  // resolve to Object.prototype.constructor.
  const marks = installed.agentMarks
  const ExtensionMark =
    marks && Object.hasOwn(marks, kind) ? marks[kind] : undefined

  if (ExtensionMark)
    return (
      <span
        aria-hidden="true"
        className={className}
        data-agent-mark={kind}
        style={{ width: box, height: box }}
      >
        <ExtensionMark size={box} muted={muted} />
      </span>
    )

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

  if (kind === 'codex') {
    const gradientId = `codex-gradient-${id}`
    const maskId = `codex-mask-${id}`

    return (
      <span
        aria-hidden="true"
        className={className}
        data-agent-mark="codex"
        style={{ width: box, height: box }}
      >
        <svg width={box} height={box} viewBox="0 0 24 24">
          <defs>
            {!muted && (
              <linearGradient
                id={gradientId}
                x1="4"
                y1="3"
                x2="20"
                y2="21"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#A78BFA" />
                <stop offset="1" stopColor="#3B82F6" />
              </linearGradient>
            )}
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="24"
              height="24"
            >
              <rect width="24" height="24" fill="white" />
              <path
                d="M7.2 8.3 10.45 12 7.2 15.7"
                fill="none"
                stroke="black"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12.55 15.4H16.75"
                fill="none"
                stroke="black"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </mask>
          </defs>
          <path
            data-codex-cloud
            d={CODEX_CLOUD}
            fill={muted ? 'currentColor' : `url(#${gradientId})`}
            mask={`url(#${maskId})`}
          />
        </svg>
      </span>
    )
  }

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
