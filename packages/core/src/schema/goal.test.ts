import { describe, expect, it } from 'vitest'
import { GOALS, GoalSchema, isSecurityGoal } from './goal'

describe('GoalSchema', () => {
  it('accepts every canonical goal', () => {
    for (const goal of GOALS) expect(GoalSchema.parse(goal)).toBe(goal)
  })

  it('rejects labels and unknown values', () => {
    expect(GoalSchema.safeParse('Documents/files').success).toBe(false)
    expect(GoalSchema.safeParse('hacking').success).toBe(false)
  })
})

describe('isSecurityGoal', () => {
  it('flags only security goals', () => {
    expect(isSecurityGoal('attack_surface')).toBe(true)
    expect(isSecurityGoal('exposed_pages')).toBe(true)
    expect(isSecurityGoal('documents')).toBe(false)
  })
})
