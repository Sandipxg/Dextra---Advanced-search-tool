import type { Template } from '@dextra/core'
import { defineTable } from '../table-factory'

/** Copy of docs/Template-Library.md, seeded from the same parser (D-019). */
export const TemplateTable = defineTable('template', (t) => ({
  id: t.text().primaryKey(),
  goal: t.text().index(),
  sensitivity: t.text(),
  status: t.text(),
  data: t.json<Template>(),
  ...t.timestamps(),
}))

/** Per template x engine x goal hit counts for the feedback loop (T-011). */
export const TemplateStatTable = defineTable('template_stat', (t) => ({
  id: t.uuid().primaryKey(),
  templateId: t.text().foreignKey('template', 'id'),
  engine: t.text(),
  goal: t.text(),
  queries: t.integer().default(0),
  results: t.integer().default(0),
  inScope: t.integer().default(0),
  useful: t.integer().default(0),
  ...t.timestamps(),
})).unique(['templateId', 'engine', 'goal'])
