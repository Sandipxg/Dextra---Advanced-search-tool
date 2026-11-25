import { defineTable } from '../table-factory'

/**
 * Deduplicated, scored results of a run (T-010). Raw SERP responses are not stored:
 * only what the report shows.
 */
export const ResultTable = defineTable('result', (t) => ({
  id: t.uuid().primaryKey(),
  runId: t.uuid().foreignKey('run', 'id').index(),
  rank: t.integer(),
  key: t.text(),
  url: t.text(),
  title: t.text(),
  snippet: t.text(),
  date: t.text().nullable(),
  source: t.text().nullable(),
  group: t.text(),
  reasons: t.json<string[]>(),
  score: t.doublePrecision(),
  bestPosition: t.integer(),
  queryKeys: t.json<string[]>(),
  templateIds: t.json<string[]>(),
  goal: t.text(),
  signal: t.text(),
})).unique(['runId', 'key'])
