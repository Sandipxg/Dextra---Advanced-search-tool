import type { Db } from './client'

export { createDb, type Db, tables } from './client'
export { seedTemplates } from './seed-templates'
export { RUN_STATUSES, type RunStatus } from './tables/run'

const findRun = (db: Db, id: string) => db.run.find(id)
/** A full `run` row, as returned by `db.run.find(id)`. */
export type RunRow = Awaited<ReturnType<typeof findRun>>
