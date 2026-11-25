import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createDb, seedTemplates } from '@dextra/db'
import { migrateAuth } from '../src/migrate-auth'

/**
 * Prepares the test database once per run: Better Auth tables, rake-db migrations,
 * template seed. Skipped when DATABASE_TEST_URL is not set (DB tests skip too).
 */
export async function setup() {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
  } catch {
    // no .env
  }
  const url = process.env.DATABASE_TEST_URL
  if (!url) return

  await migrateAuth(url)
  execSync('pnpm --filter @dextra/db db up', {
    cwd: resolve(import.meta.dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
  const db = createDb(url)
  try {
    await seedTemplates(db)
  } finally {
    await db.$close()
  }
}
