import { orchidORM } from 'orchid-orm/node-postgres'
import { AuthorizationTable } from './tables/authorization'
import { RunTable } from './tables/run'
import { SerpLocationTable } from './tables/serp-location'
import { TemplateStatTable, TemplateTable } from './tables/template'

export const tables = {
  run: RunTable,
  authorization: AuthorizationTable,
  template: TemplateTable,
  templateStat: TemplateStatTable,
  serpLocation: SerpLocationTable,
}

/** One ORM instance per process; tests create their own against the test database. */
export const createDb = (databaseURL: string, options: { log?: boolean } = {}) =>
  orchidORM({ databaseURL, log: options.log ?? false }, tables)

export type Db = ReturnType<typeof createDb>
