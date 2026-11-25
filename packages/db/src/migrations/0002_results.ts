import { change } from '../db-script'

change(async (db) => {
  await db.changeTable('run', (t) => ({
    startedAt: t.add(t.timestamp().nullable()),
    finishedAt: t.add(t.timestamp().nullable()),
    stats: t.add(t.json().nullable()),
    error: t.add(t.text().nullable()),
  }))

  await db.createTable(
    'result',
    (t) => ({
      id: t.uuid().primaryKey(),
      runId: t.uuid().foreignKey('run', 'id', { onDelete: 'CASCADE' }).index(),
      rank: t.integer(),
      key: t.text(),
      url: t.text(),
      title: t.text(),
      snippet: t.text(),
      date: t.text().nullable(),
      source: t.text().nullable(),
      group: t.text(),
      reasons: t.json(),
      score: t.doublePrecision(),
      bestPosition: t.integer(),
      queryKeys: t.json(),
      templateIds: t.json(),
      goal: t.text(),
      signal: t.text(),
    }),
    (t) => [t.unique(['runId', 'key'])],
  )
})
