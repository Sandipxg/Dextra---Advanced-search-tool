import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const SERP_KEYS = ['SERPER_API_KEY', 'SERPAPI_API_KEY', 'BRAVE_API_KEY'] as const

/**
 * Typed, validated server env. Throws on the first call if anything is missing,
 * so the API fails at startup instead of on the first request.
 */
export const createServerEnv = (runtimeEnv: Record<string, string | undefined>) => {
  const env = createEnv({
    server: {
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
      DATABASE_URL: z.url(),
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.url(),
      ANTHROPIC_API_KEY: z.string().min(1),
      SERPER_API_KEY: z.string().min(1).optional(),
      SERPAPI_API_KEY: z.string().min(1).optional(),
      BRAVE_API_KEY: z.string().min(1).optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
    // Name the bad keys only — never echo values, they may be secrets.
    onValidationError: (issues) => {
      const keys = issues.map((issue) => issue.path?.map(String).join('.') ?? '?')
      throw new Error(`Invalid environment variables: ${[...new Set(keys)].join(', ')}`)
    },
  })

  if (!SERP_KEYS.some((key) => env[key])) {
    throw new Error(`At least one SERP provider key is required: ${SERP_KEYS.join(', ')}`)
  }
  return env
}

export type ServerEnv = ReturnType<typeof createServerEnv>
