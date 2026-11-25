import { z } from 'zod'

/** A1 "What are you trying to find?" — canonical keys (Intake-Form-Spec §A, Template-Library §2). */
export const GOALS = [
  'attack_surface',
  'documents',
  'exposed_pages',
  'third_party_mentions',
  'tech_fingerprinting',
  'company_research',
  'competitor_research',
  'news_mentions',
  'general_research',
] as const

export const GoalSchema = z.enum(GOALS)
export type Goal = z.infer<typeof GoalSchema>

/** Goals whose templates are `sensitivity: security` — force Hard scope + authorization (D-003, D-012). */
export const SECURITY_GOALS = ['attack_surface', 'exposed_pages'] as const satisfies readonly Goal[]

export const isSecurityGoal = (goal: Goal): boolean =>
  (SECURITY_GOALS as readonly Goal[]).includes(goal)
