import { createTableFactory } from 'orchid-orm'
import { nodePostgresSchemaConfig } from 'orchid-orm/node-postgres'

/**
 * snake_case in the database, camelCase in code; timestamps as Date objects.
 * `nodePostgresSchemaConfig` is required with the node-postgres driver: without it, arrays
 * in json columns are sent as Postgres array literals (a non-empty array fails, an empty
 * one is stored as `{}`).
 */
export const { defineTable, sql } = createTableFactory({
  snakeCase: true,
  schemaConfig: nodePostgresSchemaConfig,
  columnTypes: (t) => ({
    ...t,
    timestamp: () => t.timestamp().asDate(),
  }),
})
