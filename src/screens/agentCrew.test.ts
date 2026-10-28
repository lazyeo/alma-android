import { describe, expect, it } from 'vitest'
import {
  activeCrewRunCount,
  crewHeaderCounts,
  crewRunCount,
  missionTimeline,
  parseAgentCrew,
} from './agentCrew'

describe('agent crew parsing', () => {
  it('filters invalid missions and orders timeline entries by time', () => {
    const crew = parseAgentCrew({
      missions: [
        {
          id: 'm1',
          title: 'Ship',
          objective: 'Finish UI',
          status: 'active',
          rootMessageId: 'row-1',
          harnessMode: 'crew',
          runs: [
            {
              id: 'r1',
              taskId: 't1',
              agentName: 'Developer',
              executionMode: 'agent',
              model: 'x',
              status: 'completed',
              inputSummary: 'Build',
              outputSummary: 'Done',
              createdAt: '2026-01-02',
            },
          ],
          handoffs: [
            {
              id: 'h1',
              toAgentName: 'Researcher',
              status: 'completed',
              packet: {
                goal: 'Find facts',
                deliverable: 'Notes',
                acceptanceCriteria: [],
              },
              resultSummary: 'Found',
              createdAt: '2026-01-01',
            },
          ],
          summary: {
            totalRuns: 1,
            completedRuns: 1,
            failedRuns: 0,
            activeRuns: 0,
          },
        },
        null,
      ],
    })
    expect(crew.missions).toHaveLength(1)
    expect(crewRunCount(crew)).toBe(1)
    expect(activeCrewRunCount(crew)).toBe(0)
    expect(missionTimeline(crew.missions[0]).map((item) => item.kind)).toEqual([
      'handoff',
      'run',
    ])
  })

  it('formats total and active run counts for the sheet header', () => {
    const crew = {
      missions: [
        {
          id: 'm',
          title: 'Ship',
          status: 'active',
          runs: [
            {
              id: 'r1',
              taskId: 't1',
              agentName: 'Developer',
              executionMode: 'implementation',
              model: 'x',
              status: 'active',
              createdAt: 1,
            },
            {
              id: 'r2',
              taskId: 't2',
              agentName: 'Evaluator',
              executionMode: 'review',
              model: 'x',
              status: 'completed',
              createdAt: 2,
            },
          ],
          handoffs: [],
        },
      ],
    }
    expect(crewHeaderCounts(crew)).toEqual({
      runs: '2 runs',
      active: '1 running',
    })
  })

  it('counts active runs from run status when summary is stale', () => {
    expect(
      activeCrewRunCount({
        missions: [
          {
            id: 'm',
            title: 'Ship',
            status: 'active',
            runs: [
              {
                id: 'r1',
                taskId: 't1',
                agentName: 'Developer',
                executionMode: 'implementation',
                model: 'x',
                status: 'active',
                createdAt: 1,
              },
              {
                id: 'r2',
                taskId: 't2',
                agentName: 'Evaluator',
                executionMode: 'review',
                model: 'x',
                status: 'completed',
                createdAt: 2,
              },
            ],
            handoffs: [],
            summary: { activeRuns: 0 },
          },
        ],
      }),
    ).toBe(1)
  })
})
