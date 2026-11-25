import type { IntakeSpec, Plan, ProposedExclusions, Selection } from '@dextra/core'
import { defineTable } from '../table-factory'

export const RUN_STATUSES = [
  'planned',
  'confirmed',
  'running',
  'done',
  'failed',
  'cancelled',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/** One search request: the validated spec, the selector's picks and the compiled plan. */
export const RunTable = defineTable('run', (t) => ({
  id: t.uuid().primaryKey(),
  /** Better Auth user id (text). */
  userId: t.text().index(),
  status: t.enum('run_status', RUN_STATUSES),
  spec: t.json<IntakeSpec>(),
  selectorSource: t.enum('selector_source', ['llm', 'rules']),
  selections: t.json<Selection[]>(),
  plan: t.json<Plan>(),
  /** Selector + engine-router notes for the pre-run summary. */
  notes: t.json<string[]>(),
  proposedExclusions: t.json<ProposedExclusions>(),
  followUpQuestion: t.text().nullable(),
  confirmedAt: t.timestamp().nullable(),
  ...t.timestamps(),
}))
