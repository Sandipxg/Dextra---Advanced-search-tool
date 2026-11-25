import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { ruleBasedSelections } from '@dextra/core'
import { createDb, type Db } from '@dextra/db'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { createAuth } from './auth'

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
} catch {
  // no .env
}
const url = process.env.DATABASE_TEST_URL
const ORIGIN = 'http://localhost:5173'

describe.skipIf(!url)('API (needs DATABASE_TEST_URL)', () => {
  let db: Db
  let app: ReturnType<typeof createApp>

  beforeAll(() => {
    db = createDb(url as string)
    app = createApp({
      db,
      auth: createAuth({
        databaseUrl: url as string,
        secret: 'test-secret-that-is-long-enough-000000',
        baseURL: 'http://localhost:3000',
        webOrigin: ORIGIN,
      }),
      // Deterministic selector so tests never call an LLM.
      select: async (spec) => ({
        source: 'rules',
        selections: ruleBasedSelections(spec),
        extraEngine: null,
        exclusions: { terms: ['careers'], sites: ['pinterest.com'] },
        followUpQuestion: null,
        notes: ['test selector'],
      }),
      webOrigin: ORIGIN,
      logger: pino({ level: 'silent' }),
      planLimit: { max: 5, windowMs: 60_000 },
    })
  })
  afterAll(async () => {
    await db.$close()
  })

  const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const headers = new Headers(init.headers)
    headers.set('origin', ORIGIN)
    if (init.body) headers.set('content-type', 'application/json')
    if (init.cookie) headers.set('cookie', init.cookie)
    return app.request(path, { ...init, headers })
  }

  /** Signs up a fresh user and returns its session cookie. */
  const signUp = async (): Promise<string> => {
    const res = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: `test-${randomUUID()}@example.test`,
        password: `pw-${randomUUID()}`,
      }),
    })
    expect(res.status).toBe(200)
    const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
    expect(cookies.length).toBeGreaterThan(0)
    return cookies.join('; ')
  }

  const docsSpec = {
    goal: 'documents',
    description: 'Public PDFs from target.com',
    scope: { domains: ['target.com'] },
  }

  const plan = async (cookie: string, spec: unknown = docsSpec) => {
    const res = await call('/api/plans', { method: 'POST', cookie, body: JSON.stringify(spec) })
    return {
      res,
      body: (await res.json()) as { ok: boolean; run: { id: string; [k: string]: unknown } },
    }
  }

  it('reports health', async () => {
    expect(await (await call('/api/health')).json()).toEqual({ ok: true })
  })

  it('validates specs with field paths', async () => {
    const ok = await call('/api/spec/validate', { method: 'POST', body: JSON.stringify(docsSpec) })
    expect(ok.status).toBe(200)
    const bad = await call('/api/spec/validate', {
      method: 'POST',
      body: JSON.stringify({
        goal: 'documents',
        description: '',
        scope: { domains: ['not a domain'] },
      }),
    })
    expect(bad.status).toBe(422)
    const { issues } = (await bad.json()) as { issues: { path: string }[] }
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['description', 'scope.domains.0']),
    )
    const junk = await call('/api/spec/validate', { method: 'POST', body: '{not json' })
    expect(junk.status).toBe(400)
  })

  it('requires sign-in for plans and runs', async () => {
    expect(
      (await call('/api/plans', { method: 'POST', body: JSON.stringify(docsSpec) })).status,
    ).toBe(401)
    expect((await call('/api/runs')).status).toBe(401)
  })

  it('plans, stores and lists a run for its owner only', async () => {
    const cookie = await signUp()
    const { res, body } = await plan(cookie)
    expect(res.status).toBe(201)
    expect(body.run).toMatchObject({
      status: 'planned',
      selectorSource: 'rules',
      proposedExclusions: { terms: ['careers'], sites: ['pinterest.com'] },
    })
    const queries = (body.run.plan as { queries: { q: string }[] }).queries
    expect(queries[0]?.q).toContain('site:target.com')
    expect(body.run.notes).toEqual(expect.arrayContaining(['test selector']))

    const own = await call(`/api/runs/${body.run.id}`, { cookie })
    expect(own.status).toBe(200)
    const list = (await (await call('/api/runs', { cookie })).json()) as { runs: { id: string }[] }
    expect(list.runs.map((r) => r.id)).toContain(body.run.id)

    const stranger = await signUp()
    expect((await call(`/api/runs/${body.run.id}`, { cookie: stranger })).status).toBe(404)
    expect((await call('/api/runs/not-a-uuid', { cookie })).status).toBe(404)
  })

  it('confirms with accepted exclusions, re-plans, and refuses a second confirm', async () => {
    const cookie = await signUp()
    const { body } = await plan(cookie)
    const res = await call(`/api/runs/${body.run.id}/confirm`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        exclusions: { terms: ['careers'], sites: ['pinterest.com', 'target.com'] },
      }),
    })
    expect(res.status).toBe(200)
    const confirmed = (await res.json()) as {
      run: { status: string; plan: { queries: { q: string }[] } }
      skippedExclusions: string[]
    }
    expect(confirmed.run.status).toBe('confirmed')
    expect(confirmed.skippedExclusions).toEqual(['target.com'])
    expect(confirmed.run.plan.queries[0]?.q).toContain('-site:pinterest.com -careers')

    const again = await call(`/api/runs/${body.run.id}/confirm`, {
      method: 'POST',
      cookie,
      body: '{}',
    })
    expect(again.status).toBe(409)
  })

  it('writes an authorization audit row when a security run is confirmed', async () => {
    const cookie = await signUp()
    const { body } = await plan(cookie, {
      goal: 'exposed_pages',
      description: 'Exposed files in our bug bounty scope',
      use_case: 'bug_bounty',
      scope: { domains: ['target.com'] },
      authorization: { confirmed: true, link: 'https://hackerone.com/target' },
    })
    const res = await call(`/api/runs/${body.run.id}/confirm`, {
      method: 'POST',
      cookie,
      body: '{}',
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    })
    expect(res.status).toBe(200)
    const audit = await db.authorization.where({ runId: body.run.id }).take()
    expect(audit).toMatchObject({
      useCase: 'bug_bounty',
      domains: ['target.com'],
      link: 'https://hackerone.com/target',
      ipAddress: '203.0.113.7',
    })
  })

  it('rate-limits plans per user', async () => {
    const cookie = await signUp()
    for (let i = 0; i < 5; i++) expect((await plan(cookie)).res.status).toBe(201)
    const limited = await plan(cookie)
    expect(limited.res.status).toBe(429)
    expect(Number(limited.res.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('serves cached locations for a country', async () => {
    const cookie = await signUp()
    const id = 9_000_000 + Math.floor(Math.random() * 100_000)
    await db.serpLocation.create({
      id,
      name: `Ahmedabad ${id}`,
      canonicalName: `Ahmedabad ${id},Gujarat,India`,
      countryCode: 'IN',
      targetType: 'City',
      reach: 1000,
    })
    const res = await call(`/api/locations?country=in&q=ahmedabad%20${id}`, { cookie })
    const { locations } = (await res.json()) as { locations: { id: number }[] }
    expect(locations.map((l) => l.id)).toEqual([id])
    expect((await call('/api/locations?country=xx', { cookie })).status).toBe(422)
  })
})
