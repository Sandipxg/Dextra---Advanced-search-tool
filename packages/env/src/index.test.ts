import { describe, expect, it } from 'vitest'
import { createServerEnv } from './index'

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/dextra',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  ANTHROPIC_API_KEY: 'test-key',
  SERPER_API_KEY: 'test-serper',
}

describe('createServerEnv', () => {
  it('parses a valid env and applies defaults', () => {
    const env = createServerEnv(valid)
    expect(env.NODE_ENV).toBe('development')
    expect(env.LOG_LEVEL).toBe('info')
  })

  it('fails fast when a required key is missing', () => {
    const { BETTER_AUTH_SECRET: _omit, ...rest } = valid
    expect(() => createServerEnv(rest)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('treats the Anthropic and GitHub keys as optional and defaults the rest', () => {
    const { ANTHROPIC_API_KEY: _omit, ...rest } = valid
    const env = createServerEnv(rest)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.GITHUB_CLIENT_ID).toBeUndefined()
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173')
    expect(env.PORT).toBe(3000)
  })

  it('treats empty strings as missing', () => {
    expect(() => createServerEnv({ ...valid, DATABASE_URL: '' })).toThrow()
  })

  it('requires at least one SERP provider key', () => {
    expect(() => createServerEnv({ ...valid, SERPER_API_KEY: '' })).toThrow(/SERP provider/)
  })
})
