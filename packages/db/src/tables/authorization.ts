import { defineTable } from '../table-factory'

/** Audit log: who confirmed authorization for which security run (F6). Insert-only. */
export const AuthorizationTable = defineTable('authorization', (t) => ({
  id: t.uuid().primaryKey(),
  runId: t.uuid().foreignKey('run', 'id').index(),
  userId: t.text().index(),
  useCase: t.text(),
  domains: t.json<string[]>(),
  link: t.text().nullable(),
  ipAddress: t.text().nullable(),
  confirmedAt: t.timestamp(),
}))
