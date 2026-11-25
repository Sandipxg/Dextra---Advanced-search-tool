/**
 * Creates or updates Better Auth's tables (user, session, account, verification).
 *
 *   pnpm --filter @dextra/api migrate:auth
 */
import { resolve } from 'node:path'
import { getMigrations } from 'better-auth/db/migration'
import { createAuth } from './auth'

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
} catch {
  // no .env: rely on the real environment
}

export const migrateAuth = async (databaseUrl: string) => {
  const auth = createAuth({
    databaseUrl,
    // Migrations don't sign anything; a placeholder keeps Better Auth's config check happy.
    secret: process.env.BETTER_AUTH_SECRET ?? 'migration-only-placeholder-secret-0000',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  })
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  return { created: toBeCreated.map((t) => t.table), added: toBeAdded.map((t) => t.table) }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is missing (set it in .env)')
  const result = await migrateAuth(url)
  console.log(
    `Better Auth tables created: ${result.created.join(', ') || 'none'}; updated: ${result.added.join(', ') || 'none'}`,
  )
  process.exit(0)
}
