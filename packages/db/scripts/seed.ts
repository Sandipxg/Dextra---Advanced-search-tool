/** Seeds templates from the generated library: `pnpm --filter @dextra/db seed` */
import { createDb } from '../src/client'
import { config } from '../src/config'
import { seedTemplates } from '../src/seed-templates'

const db = createDb(config.database.databaseURL)
try {
  console.log(`Seeded ${await seedTemplates(db)} templates`)
} finally {
  await db.$close()
}
