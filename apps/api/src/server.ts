import { resolve } from 'node:path'
import { createDb } from '@dextra/db'
import { createServerEnv } from '@dextra/env'
import { selectTemplates } from '@dextra/selector'
import { createProviders } from '@dextra/serp'
import { serve } from '@hono/node-server'
import pino from 'pino'
import { createApp } from './app'
import { createAuth } from './auth'
import { createSearch } from './search'

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
} catch {
  // no .env: rely on the real environment
}

const env = createServerEnv(process.env)
const logger = pino({ level: env.LOG_LEVEL })

const app = createApp({
  db: createDb(env.DATABASE_URL),
  auth: createAuth({
    databaseUrl: env.DATABASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    webOrigin: env.WEB_ORIGIN,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
        : undefined,
  }),
  select: (spec, { trackRecord }) => selectTemplates(spec, { trackRecord }),
  search: createSearch(createProviders(env)),
  webOrigin: env.WEB_ORIGIN,
  logger,
})

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`)
})
