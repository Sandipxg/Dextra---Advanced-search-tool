import { createTableFactory } from 'orchid-orm'

/** snake_case in the database, camelCase in code; timestamps as Date objects. */
export const { defineTable, sql } = createTableFactory({
  snakeCase: true,
  columnTypes: (t) => ({
    ...t,
    timestamp: () => t.timestamp().asDate(),
  }),
})
