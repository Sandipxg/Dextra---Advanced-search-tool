import { defineTable } from '../table-factory'

/** Cached SERP API locations for the C2 city dropdown (T-008). */
export const SerpLocationTable = defineTable('serp_location', (t) => ({
  id: t.integer().primaryKey(),
  name: t.text(),
  canonicalName: t.text().unique(),
  countryCode: t.text().index(),
  targetType: t.text(),
  reach: t.integer().nullable(),
}))
