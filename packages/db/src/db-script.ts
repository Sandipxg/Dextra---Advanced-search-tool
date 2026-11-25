/**
 * Migrations CLI (rake-db). Migrations are written by hand: `db g` would drop tables it
 * does not know about, including Better Auth's (user, session, account, verification).
 *
 *   pnpm --filter @dextra/db db up | down | s | new <name> | create | drop
 */
import { rakeDb } from 'orchid-orm/migrations/node-postgres'
import { config } from './config'
import { defineTable } from './table-factory'

export const change = rakeDb.run(config.database, {
  migrationsPath: './migrations',
  migrationId: 'serial',
  defineTable,
  import: (path) => import(path),
})
