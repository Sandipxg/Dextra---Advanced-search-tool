import {
  applyExclusions,
  buildPlan,
  COUNTRY_CODES,
  feedbackDelta,
  formatTrackRecord,
  IntakeFormSchema,
  type IntakeSpec,
  isSecurityRun,
  priorityBoosts,
  routeEngines,
  type ScoredResult,
  type SearchFn,
  summarizeStats,
  toCsv,
} from '@dextra/core'
import type { Db, ResultRow, RunRow } from '@dextra/db'
import type { SelectorResult } from '@dextra/selector'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import { z } from 'zod'
import type { Auth } from './auth'
import { executeRun } from './execute'
import { createRateLimiter } from './rate-limit'

export interface AppDeps {
  db: Db
  auth: Auth
  select: (spec: IntakeSpec, context: { trackRecord: string }) => Promise<SelectorResult>
  /** SERP search for the runner (`createSearch(providers)` in production). */
  search: SearchFn
  webOrigin: string
  logger: Logger
  /** Plans cost an LLM call; defaults to 30 per user per hour. */
  planLimit?: { max: number; windowMs: number }
  /**
   * Starts a run in the background. Default: fire and forget in this process (one API
   * instance; a job queue when there are more). Tests pass one that keeps the promise.
   */
  background?: (task: Promise<void>) => void
}

type User = { id: string; email: string }
type Env = { Variables: { user: User } }

/** Zod issues → `{ path: 'scope.domains.0', message }` for the form. */
const issuesOf = (error: z.ZodError) =>
  error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))

const readJson = async (req: { json: () => Promise<unknown> }): Promise<unknown> => {
  try {
    return await req.json()
  } catch {
    throw new HTTPException(400, { message: 'Body must be JSON' })
  }
}

/** What the pre-run summary and run pages need. */
const toSummary = (run: RunRow) => ({
  id: run.id,
  status: run.status,
  spec: run.spec,
  selectorSource: run.selectorSource,
  notes: run.notes,
  plan: run.plan,
  proposedExclusions: run.proposedExclusions,
  followUpQuestion: run.followUpQuestion,
  createdAt: run.createdAt,
  confirmedAt: run.confirmedAt,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  stats: run.stats,
  error: run.error,
})

/** Stored row → the shape the report helpers use. */
const toScored = (r: ResultRow): ScoredResult => ({
  url: r.url,
  key: r.key,
  title: r.title,
  snippet: r.snippet,
  ...(r.date ? { date: r.date } : {}),
  ...(r.source ? { source: r.source } : {}),
  group: r.group as ScoredResult['group'],
  reasons: r.reasons,
  score: Number(r.score),
  bestPosition: r.bestPosition,
  queryKeys: r.queryKeys,
  templateIds: r.templateIds,
  goal: r.goal,
  signal: r.signal as ScoredResult['signal'],
})

const ResultsQuerySchema = z.object({
  group: z.enum(['main', 'outside', 'unverified']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const ExportQuerySchema = z.object({ format: z.enum(['csv', 'json']) })
const FeedbackSchema = z.strictObject({ value: z.enum(['useful', 'not_useful']).nullable() })

/** What the report page needs per result: the scored fields plus id and rating. */
const toReportItem = (r: ResultRow) => ({ ...toScored(r), id: r.id, feedback: r.feedback })

const ConfirmSchema = z.strictObject({
  exclusions: z
    .strictObject({
      terms: z.array(z.string().max(100)).max(30).default([]),
      sites: z.array(z.string().max(253)).max(30).default([]),
    })
    .optional(),
})

const LocationQuerySchema = z.object({
  country: z.enum(COUNTRY_CODES),
  q: z.string().trim().max(50).default(''),
})

export const createApp = (deps: AppDeps) => {
  const { db, auth, logger } = deps
  const limit = deps.planLimit ?? { max: 30, windowMs: 60 * 60 * 1000 }
  const planLimiter = createRateLimiter(limit.max, limit.windowMs)
  const background =
    deps.background ??
    ((task: Promise<void>) => {
      task.catch((err: unknown) => logger.error({ err }, 'background task failed'))
    })

  /** What past ratings and scope rates say about this goal's templates (T-011). */
  const learned = async (goal: string) => {
    const rows = await db.templateStat
      .select(
        'templateId',
        'engine',
        'goal',
        'queries',
        'results',
        'inScope',
        'useful',
        'notUseful',
      )
      .where({ goal })
    const records = summarizeStats(rows)
    const boosts = priorityBoosts(records)
    const up = Object.keys(boosts).filter((id) => (boosts[id] ?? 0) > 0)
    const down = Object.keys(boosts).filter((id) => (boosts[id] ?? 0) < 0)
    const notes = [
      ...(up.length ? [`Ranked higher from past ratings: ${up.join(', ')}`] : []),
      ...(down.length
        ? [`Ranked lower from past ratings or off-scope results: ${down.join(', ')}`]
        : []),
    ]
    return { boosts, trackRecord: formatTrackRecord(records), notes }
  }

  const app = new Hono<Env>()

  // Request log: method, path, status, duration. Never bodies, cookies or headers.
  app.use('*', async (c, next) => {
    const start = performance.now()
    await next()
    logger.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    })
  })

  app.use('/api/*', cors({ origin: deps.webOrigin, credentials: true }))
  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  app.get('/api/health', (c) => c.json({ ok: true }))

  /** Form validation, no account needed: same schema as the form and the planner (D-005). */
  app.post('/api/spec/validate', async (c) => {
    const result = IntakeFormSchema.safeParse(await readJson(c.req))
    return result.success
      ? c.json({ ok: true, spec: result.data })
      : c.json({ ok: false, issues: issuesOf(result.error) }, 422)
  })

  const requireUser = createMiddleware<Env>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) throw new HTTPException(401, { message: 'Sign in first' })
    c.set('user', { id: session.user.id, email: session.user.email })
    await next()
  })

  /** Validates the spec, picks templates, compiles the plan, stores a `planned` run. */
  app.post('/api/plans', requireUser, async (c) => {
    const user = c.get('user')
    const parsed = IntakeFormSchema.safeParse(await readJson(c.req))
    if (!parsed.success) return c.json({ ok: false, issues: issuesOf(parsed.error) }, 422)
    const wait = planLimiter.consume(user.id)
    if (wait > 0) {
      c.header('Retry-After', String(wait))
      return c.json({ ok: false, error: 'Too many plans, try again later' }, 429)
    }

    const spec = parsed.data
    const evidence = await learned(spec.goal)
    const selection = await deps.select(spec, { trackRecord: evidence.trackRecord })
    const route = routeEngines(spec, selection.extraEngine)
    const plan = buildPlan(spec, selection.selections, { boosts: evidence.boosts })
    const run = await db.run.create({
      userId: user.id,
      status: 'planned',
      spec,
      selectorSource: selection.source,
      selections: selection.selections,
      plan,
      notes: [...selection.notes, ...route.notes, ...evidence.notes],
      proposedExclusions: selection.exclusions,
      followUpQuestion: selection.followUpQuestion,
    })
    return c.json({ ok: true, run: toSummary(run) }, 201)
  })

  const ownRun = async (userId: string, id: string): Promise<RunRow> => {
    if (!z.uuid().safeParse(id).success) throw new HTTPException(404, { message: 'Run not found' })
    const run = await db.run.findByOptional({ id })
    // Someone else's run is reported as missing, not forbidden.
    if (!run || run.userId !== userId) throw new HTTPException(404, { message: 'Run not found' })
    return run
  }

  /**
   * The user confirms the pre-run summary, optionally with the exclusions they accepted.
   * Security runs write an authorization audit row (F6). Execution is Phase 8.
   */
  app.post('/api/runs/:id/confirm', requireUser, async (c) => {
    const user = c.get('user')
    const body = ConfirmSchema.safeParse(await readJson(c.req))
    if (!body.success) return c.json({ ok: false, issues: issuesOf(body.error) }, 422)
    const run = await ownRun(user.id, c.req.param('id'))
    if (run.status !== 'planned') {
      return c.json({ ok: false, error: `Run is already ${run.status}` }, 409)
    }

    let spec = run.spec
    let plan = run.plan
    let skipped: string[] = []
    const ex = body.data.exclusions
    if (ex && (ex.terms.length || ex.sites.length)) {
      const applied = applyExclusions(spec, ex)
      spec = applied.spec
      skipped = applied.skipped
      plan = buildPlan(spec, run.selections, { boosts: (await learned(spec.goal)).boosts })
    }

    const confirmedAt = new Date()
    const updated = await db.$transaction(async () => {
      if (isSecurityRun(spec)) {
        await db.authorization.create({
          runId: run.id,
          userId: user.id,
          useCase: spec.use_case ?? 'unknown',
          domains: spec.scope.domains,
          link: spec.authorization?.link ?? null,
          ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          confirmedAt,
        })
      }
      return db.run
        .selectAll()
        .find(run.id)
        .update({ status: 'confirmed', spec, plan, confirmedAt })
    })
    // Searches start after the response; the client polls GET /api/runs/:id.
    background(executeRun({ db, search: deps.search, logger }, run.id))
    return c.json({ ok: true, run: toSummary(updated), skippedExclusions: skipped }, 202)
  })

  /** Main / outside / unverified results, ranked, paged. */
  app.get('/api/runs/:id/results', requireUser, async (c) => {
    const run = await ownRun(c.get('user').id, c.req.param('id'))
    const query = ResultsQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ ok: false, issues: issuesOf(query.error) }, 422)
    const { group, limit: take, offset } = query.data
    let rows = db.result.selectAll().where({ runId: run.id })
    if (group) rows = rows.where({ group })
    const results = await rows.order({ rank: 'ASC' }).limit(take).offset(offset)
    return c.json({
      ok: true,
      status: run.status,
      stats: run.stats,
      results: results.map(toReportItem),
    })
  })

  /**
   * The run owner rates one result (T-011). The rating and the per-template counters of
   * every template that found it change together; changing or clearing a rating undoes the
   * old one.
   */
  app.post('/api/runs/:id/results/:resultId/feedback', requireUser, async (c) => {
    const run = await ownRun(c.get('user').id, c.req.param('id'))
    const body = FeedbackSchema.safeParse(await readJson(c.req))
    if (!body.success) return c.json({ ok: false, issues: issuesOf(body.error) }, 422)
    const resultId = c.req.param('resultId')
    if (!z.uuid().safeParse(resultId).success)
      throw new HTTPException(404, { message: 'Result not found' })
    const result = await db.result.findByOptional({ id: resultId })
    if (!result || result.runId !== run.id)
      throw new HTTPException(404, { message: 'Result not found' })

    const next = body.data.value
    const delta = feedbackDelta(result.feedback, next)
    if (delta.useful !== 0 || delta.notUseful !== 0) {
      await db.$transaction(async () => {
        await db.result
          .find(result.id)
          .update({ feedback: next, feedbackAt: next ? new Date() : null })
        for (const templateId of result.templateIds) {
          const engine =
            run.plan.queries.find(
              (q) => q.templateId === templateId && result.queryKeys.includes(q.key),
            )?.engine ?? 'google'
          const where = { templateId, engine, goal: run.spec.goal }
          const existing = await db.templateStat.where(where).takeOptional()
          if (existing) {
            await db.templateStat
              .where(where)
              .increment({ useful: delta.useful, notUseful: delta.notUseful })
          } else {
            await db.templateStat.create({
              ...where,
              useful: Math.max(0, delta.useful),
              notUseful: Math.max(0, delta.notUseful),
            })
          }
        }
      })
    }
    return c.json({ ok: true, feedback: next })
  })

  /** F5 exports: every result of a finished run as CSV or JSON. */
  app.get('/api/runs/:id/export', requireUser, async (c) => {
    const run = await ownRun(c.get('user').id, c.req.param('id'))
    const query = ExportQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ ok: false, issues: issuesOf(query.error) }, 422)
    if (run.status !== 'done') return c.json({ ok: false, error: `Run is ${run.status}` }, 409)
    const results = (
      await db.result.selectAll().where({ runId: run.id }).order({ rank: 'ASC' })
    ).map(toScored)
    const name = `dextra-${run.id.slice(0, 8)}`
    if (query.data.format === 'csv') {
      return c.body(toCsv(results), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.csv"`,
      })
    }
    c.header('Content-Disposition', `attachment; filename="${name}.json"`)
    return c.json({ run: toSummary(run), results })
  })

  app.get('/api/runs/:id', requireUser, async (c) => {
    const run = await ownRun(c.get('user').id, c.req.param('id'))
    return c.json({ ok: true, run: toSummary(run) })
  })

  app.get('/api/runs', requireUser, async (c) => {
    const runs = await db.run
      .select('id', 'status', 'spec', 'createdAt')
      .where({ userId: c.get('user').id })
      .order({ createdAt: 'DESC' })
      .limit(20)
    return c.json({
      ok: true,
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        goal: r.spec.goal,
        description: r.spec.description,
        createdAt: r.createdAt,
      })),
    })
  })

  /** C2 dropdown: cached SERP locations for one country (T-008 fills the table). */
  app.get('/api/locations', requireUser, async (c) => {
    const query = LocationQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ ok: false, issues: issuesOf(query.error) }, 422)
    const { country, q } = query.data
    let rows = db.serpLocation
      .select('id', 'name', 'canonicalName', 'targetType')
      .where({ countryCode: country.toUpperCase() })
    if (q) rows = rows.where({ name: { contains: q } })
    return c.json({ ok: true, locations: await rows.order({ reach: 'DESC' }).limit(20) })
  })

  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ ok: false, error: error.message }, error.status)
    logger.error({ err: error, path: c.req.path }, 'unhandled error')
    return c.json({ ok: false, error: 'Something went wrong' }, 500)
  })

  return app
}
