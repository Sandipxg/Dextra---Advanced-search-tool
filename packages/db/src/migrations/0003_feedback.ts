import { change } from '../db-script'

change(async (db) => {
  await db.createEnum('result_feedback', ['useful', 'not_useful'])
  await db.changeTable('result', (t) => ({
    feedback: t.add(t.enum('result_feedback').nullable()),
    feedbackAt: t.add(t.timestamp().nullable()),
  }))
  await db.changeTable('template_stat', (t) => ({
    notUseful: t.add(t.integer().default(0)),
  }))
})
