import { TEMPLATES } from '@dextra/core'
import type { Db } from './client'

/** Upserts every template from the generated library (D-019). Returns the count. */
export const seedTemplates = async (db: Db): Promise<number> => {
  for (const t of TEMPLATES) {
    const fields = { goal: t.goal, sensitivity: t.sensitivity, status: t.status, data: t }
    await db.template
      .findBy({ id: t.id })
      .upsert({ update: fields, create: { id: t.id, ...fields } })
  }
  return TEMPLATES.length
}
