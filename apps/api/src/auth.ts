import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

export interface AuthConfig {
  databaseUrl: string
  secret: string
  baseURL: string
  webOrigin: string
  github?: { clientId: string; clientSecret: string } | undefined
}

/**
 * Better Auth with email/password, optional GitHub, on the same Postgres database.
 * Its tables (user, session, account, verification) are managed by Better Auth's own
 * migrations (`pnpm --filter @dextra/api migrate:auth`), not rake-db.
 */
export const createAuth = (config: AuthConfig) =>
  betterAuth({
    database: new Pool({ connectionString: config.databaseUrl }),
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [config.webOrigin],
    emailAndPassword: { enabled: true },
    socialProviders: config.github ? { github: config.github } : {},
    rateLimit: { enabled: true, window: 60, max: 100 },
  })

export type Auth = ReturnType<typeof createAuth>
