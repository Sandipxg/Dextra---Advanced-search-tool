import { change } from '../db-script'

change(async (db) => {
  await db.createEnum('run_status', [
    'planned',
    'confirmed',
    'running',
    'done',
    'failed',
    'cancelled',
  ])
  await db.createEnum('selector_source', ['llm', 'rules'])

  await db.createTable('run', (t) => ({
    id: t.uuid().primaryKey(),
    userId: t.text().index(),
    status: t.enum('run_status'),
    spec: t.json(),
    selectorSource: t.enum('selector_source'),
    selections: t.json(),
    plan: t.json(),
    notes: t.json(),
    proposedExclusions: t.json(),
    followUpQuestion: t.text().nullable(),
    confirmedAt: t.timestamp().nullable(),
    ...t.timestamps(),
  }))

  await db.createTable('authorization', (t) => ({
    id: t.uuid().primaryKey(),
    runId: t.uuid().foreignKey('run', 'id').index(),
    userId: t.text().index(),
    useCase: t.text(),
    domains: t.json(),
    link: t.text().nullable(),
    ipAddress: t.text().nullable(),
    confirmedAt: t.timestamp(),
  }))

  await db.createTable('template', (t) => ({
    id: t.text().primaryKey(),
    goal: t.text().index(),
    sensitivity: t.text(),
    status: t.text(),
    data: t.json(),
    ...t.timestamps(),
  }))

  await db.createTable(
    'template_stat',
    (t) => ({
      id: t.uuid().primaryKey(),
      templateId: t.text().foreignKey('template', 'id'),
      engine: t.text(),
      goal: t.text(),
      queries: t.integer().default(0),
      results: t.integer().default(0),
      inScope: t.integer().default(0),
      useful: t.integer().default(0),
      ...t.timestamps(),
    }),
    (t) => [t.unique(['templateId', 'engine', 'goal'])],
  )

  await db.createTable('serp_location', (t) => ({
    id: t.integer().primaryKey(),
    name: t.text(),
    canonicalName: t.text().unique(),
    countryCode: t.text().index(),
    targetType: t.text(),
    reach: t.integer().nullable(),
  }))
})
