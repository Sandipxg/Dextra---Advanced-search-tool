import type { Db } from './client'

export { createDb, type Db, tables } from './client'
export { seedTemplates } from './seed-templates'
export { RUN_STATUSES, type RunStats, type RunStatus } from './tables/run'

const findRun = (db: Db, id: string) => db.run.find(id)
/** A full `run` row, as returned by `db.run.find(id)`. */
export type RunRow = Awaited<ReturnType<typeof findRun>>

const findResult = (db: Db, id: string) => db.result.find(id)
/** A stored result row. */
export type ResultRow = Awaited<ReturnType<typeof findResult>>
