export interface CrewRun {
  id: string
  taskId: string
  agentName: string
  executionMode: string
  model: string
  status: string
  inputSummary?: string
  outputSummary?: string
  createdAt: string | number
}
export interface CrewHandoff {
  id: string
  toAgentName: string
  status: string
  packet?: {
    goal?: string
    deliverable?: string
    acceptanceCriteria?: string[]
  }
  resultSummary?: string
  createdAt: string | number
}
export interface CrewMission {
  id: string
  title: string
  objective?: string
  status: string
  rootMessageId?: string
  harnessMode?: string
  runs: CrewRun[]
  handoffs: CrewHandoff[]
  summary?: {
    totalRuns?: number
    completedRuns?: number
    failedRuns?: number
    activeRuns?: number
  }
}
export interface AgentCrew {
  missions: CrewMission[]
}

export function parseAgentCrew(value: unknown): AgentCrew {
  const missions = Array.isArray((value as any)?.missions)
    ? (value as any).missions
    : []
  return {
    missions: missions
      .filter(
        (mission: any): mission is CrewMission =>
          mission &&
          typeof mission.id === 'string' &&
          typeof mission.title === 'string',
      )
      .map((mission: any) => ({
        ...mission,
        status: String(mission.status ?? 'unknown'),
        runs: Array.isArray(mission.runs) ? mission.runs : [],
        handoffs: Array.isArray(mission.handoffs) ? mission.handoffs : [],
      })),
  }
}
export const crewRunCount = (crew: AgentCrew) =>
  crew.missions.reduce((total, mission) => total + mission.runs.length, 0)

const ACTIVE_RUN_STATUSES = new Set([
  'active',
  'running',
  'pending',
  'queued',
  'starting',
])

export const activeCrewRunCount = (crew: AgentCrew) =>
  crew.missions.reduce(
    (total, mission) =>
      total +
      mission.runs.filter((run) =>
        ACTIVE_RUN_STATUSES.has(run.status.toLowerCase()),
      ).length,
    0,
  )

export function crewHeaderCounts(crew: AgentCrew) {
  const total = crewRunCount(crew)
  const active = activeCrewRunCount(crew)
  return {
    runs: `${total} ${total === 1 ? 'run' : 'runs'}`,
    active: active ? `${active} running` : undefined,
  }
}

export function missionTimeline(mission: CrewMission) {
  return [
    ...mission.runs.map((value) => ({
      kind: 'run' as const,
      value,
      at: Date.parse(String(value.createdAt)) || 0,
    })),
    ...mission.handoffs.map((value) => ({
      kind: 'handoff' as const,
      value,
      at: Date.parse(String(value.createdAt)) || 0,
    })),
  ].sort((a, b) => a.at - b.at)
}
