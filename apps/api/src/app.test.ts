import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { ruleBasedSelections, type SearchFn } from '@dextra/core'
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
  /** Background runs started by confirm; tests await them. */
  const tasks: Promise<void>[] = []
  /** Fake SERP: in-scope PDFs plus one off-scope page the engine "ignored scope" on. */
  const search: SearchFn = async (query) => [
    { url: 'https://target.com/report.pdf', title: 'Annual report', snippet: 'x', position: 1 },
    { url: 'https://docs.target.com/deck.pdf', title: 'Deck', snippet: '=cmd', position: 2 },
    { url: 'https://wired.com/story', title: 'Story', snippet: query.key, position: 3 },
  ]

  beforeAll(() => {
    db = createDb(url as string)
    app = createApp({
      db,
      auth: createAuth({
        databaseUrl: url as string,
        secret: 'test-secret-that-is-long-enough-000000',
        baseURL: 'http://localhost:3000',
        webOrigin: ORIGIN,
        rateLimit: false,
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
      search,
      background: (task) => {
        tasks.push(task)
      },
      webOrigin: ORIGIN,
      logger: pino({ level: process.env.TEST_LOG ?? 'silent' }),
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
    keywords: { all: ['annual report'] },
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
      // Keywords are required on the form (D-026); the description is optional.
      expect.arrayContaining(['keywords.all', 'scope.domains.0']),
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
    expect(res.status).toBe(202)
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
    expect(res.status).toBe(202)
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

  it('runs a confirmed plan in the background and serves grouped results and exports', async () => {
    const cookie = await signUp()
    const { body } = await plan(cookie)
    const id = body.run.id
    tasks.length = 0
    await call(`/api/runs/${id}/confirm`, { method: 'POST', cookie, body: '{}' })
    expect(tasks).toHaveLength(1)
    await Promise.all(tasks)

    const run = (await (await call(`/api/runs/${id}`, { cookie })).json()) as {
      run: { status: string; stats: { requests: number; main: number; outside: number } }
    }
    expect(run.run.status).toBe('done')
    expect(run.run.stats.main).toBe(2)
    expect(run.run.stats.outside).toBe(1)
    expect(run.run.stats.requests).toBeGreaterThan(0)

    const main = (await (await call(`/api/runs/${id}/results?group=main`, { cookie })).json()) as {
      results: { url: string; group: string }[]
    }
    expect(main.results.map((r) => r.url)).toEqual([
      'https://target.com/report.pdf',
      'https://docs.target.com/deck.pdf',
    ])
    const outside = (await (
      await call(`/api/runs/${id}/results?group=outside`, { cookie })
    ).json()) as {
      results: { url: string; reasons: string[] }[]
    }
    expect(outside.results[0]).toMatchObject({ url: 'https://wired.com/story' })

    const csv = await call(`/api/runs/${id}/export?format=csv`, { cookie })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const text = await csv.text()
    expect(text).toContain('https://target.com/report.pdf')
    expect(text).toContain("'=cmd") // formula neutralised
    const json = await call(`/api/runs/${id}/export?format=json`, { cookie })
    expect(((await json.json()) as { results: unknown[] }).results).toHaveLength(3)

    const stats = await db.templateStat.where({ goal: 'documents' }).take()
    expect(stats.queries).toBeGreaterThan(0)
  })

  it('rates results, keeps template counters in step, and only for the owner (T-011)', async () => {
    const cookie = await signUp()
    const { body } = await plan(cookie)
    const id = body.run.id
    tasks.length = 0
    await call(`/api/runs/${id}/confirm`, { method: 'POST', cookie, body: '{}' })
    await Promise.all(tasks)
    const { results } = (await (
      await call(`/api/runs/${id}/results?group=main`, { cookie })
    ).json()) as {
      results: { id: string; feedback: string | null; templateIds: string[] }[]
    }
    const target = results[0] as { id: string; feedback: string | null; templateIds: string[] }
    expect(target.feedback).toBeNull()
    const templateId = target.templateIds[0] as string
    const counters = async () => {
      const s = await db.templateStat
        .where({ templateId, engine: 'google', goal: 'documents' })
        .take()
      return { useful: s.useful, notUseful: s.notUseful }
    }
    const rate = (value: string | null, who = cookie) =>
      call(`/api/runs/${id}/results/${target.id}/feedback`, {
        method: 'POST',
        cookie: who,
        body: JSON.stringify({ value }),
      })

    const before = await counters()
    expect((await rate('useful')).status).toBe(200)
    expect(await counters()).toEqual({ useful: before.useful + 1, notUseful: before.notUseful })
    expect((await db.result.find(target.id)).feedback).toBe('useful')

    await rate('useful') // same rating again: no double count
    expect(await counters()).toEqual({ useful: before.useful + 1, notUseful: before.notUseful })

    await rate('not_useful')
    expect(await counters()).toEqual({ useful: before.useful, notUseful: before.notUseful + 1 })

    await rate(null)
    expect(await counters()).toEqual(before)
    expect((await db.result.find(target.id)).feedback).toBeNull()

    const reloaded = (await (
      await call(`/api/runs/${id}/results?group=main`, { cookie })
    ).json()) as {
      results: { id: string; feedback: string | null }[]
    }
    expect(reloaded.results.find((r) => r.id === target.id)?.feedback).toBeNull()

    expect((await rate('great')).status).toBe(422)
    expect((await rate('useful', await signUp())).status).toBe(404)
    expect(
      (
        await call(`/api/runs/${id}/results/00000000-0000-4000-8000-000000000000/feedback`, {
          method: 'POST',
          cookie,
          body: JSON.stringify({ value: 'useful' }),
        })
      ).status,
    ).toBe(404)
  })

  it('uses past ratings when planning (T-011)', async () => {
    const where = { templateId: 'co_key_pages', engine: 'google', goal: 'company_research' }
    const existing = await db.templateStat.where(where).takeOptional()
    if (existing) await db.templateStat.where(where).update({ useful: 20, notUseful: 0 })
    else await db.templateStat.create({ ...where, useful: 20, notUseful: 0 })

    const cookie = await signUp()
    const { body } = await plan(cookie, {
      goal: 'company_research',
      description: 'Leadership and investor pages',
      scope: { domains: ['target.com'] },
      keywords: { all: ['leadership'] },
    })
    expect(body.run.notes).toEqual(
      expect.arrayContaining(['Ranked higher from past ratings: co_key_pages']),
    )
  })

  it('marks a run failed when every search fails, without leaking details', async () => {
    const failing = createApp({
      db,
      auth: createAuth({
        databaseUrl: url as string,
        secret: 'test-secret-that-is-long-enough-000000',
        baseURL: 'http://localhost:3000',
        webOrigin: ORIGIN,
        rateLimit: false,
      }),
      select: async (spec) => ({
        source: 'rules',
        selections: ruleBasedSelections(spec),
        extraEngine: null,
        exclusions: { terms: [], sites: [] },
        followUpQuestion: null,
        notes: [],
      }),
      search: async () => {
        throw new Error('[serpapi] HTTP 401: invalid api_key=secret')
      },
      background: (task) => {
        tasks.push(task)
      },
      webOrigin: ORIGIN,
      logger: pino({ level: 'silent' }),
    })
    const cookie = await signUp()
    const planned = await failing.request('/api/plans', {
      method: 'POST',
      headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
      body: JSON.stringify(docsSpec),
    })
    const { run } = (await planned.json()) as { run: { id: string } }
    tasks.length = 0
    await failing.request(`/api/runs/${run.id}/confirm`, {
      method: 'POST',
      headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
      body: '{}',
    })
    await Promise.all(tasks)
    const row = await db.run.find(run.id)
    expect(row.status).toBe('failed')
    expect(row.error).toBe('The search could not be completed. Try again later.')
    expect((await call(`/api/runs/${run.id}/export?format=csv`, { cookie })).status).toBe(409)
  })
})
