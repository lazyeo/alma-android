import { expect, it } from 'vitest'
import { parseGoal, goalStatus } from './threadGoal'
it('parses a goal and distinguishes achieved and paused from active', () => {
  const goal = parseGoal({
    condition: 'Finish tests',
    setAt: 10,
    turnsEvaluated: 2,
  })
  expect(goalStatus(goal)).toBe('active')
  expect(goalStatus({ ...goal!, pausedAt: 20 })).toBe('paused')
  expect(goalStatus({ ...goal!, achievedAt: 30 })).toBe('achieved')
  expect(parseGoal({ condition: ' ', setAt: 10 })).toBeNull()
  expect(parseGoal(null)).toBeNull()
})
