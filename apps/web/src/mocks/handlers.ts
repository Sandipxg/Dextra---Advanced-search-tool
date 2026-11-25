/**
 * In-browser / in-test stand-in for apps/api. Uses the real core pipeline (rule-based
 * selector, buildPlan, runPlan, scoreResults) with a fake search engine, so the UI shows
 * genuine plans and scoring without a database or SERP key.
 */
import {
  applyExclusions,
  buildPlan,
  IntakeFormSchema,
  type IntakeSpec,
  type PlannedQuery,
  type RawResult,
  routeEngines,
  ruleBasedSelections,
  runPlan,
  type ScoredResult,
  scoreResults,
  summarizeResults,
  toCsv,
} from '@dextra/core'
import { delay, HttpResponse, http } from 'msw'
import type { RunSummary } from '../lib/api'

interface MockState {
  user: { id: string; email: string; name: string } | null
  runs: Map<string, RunSummary>
  results: Map<string, ScoredResult[]>
  /** `${runId}:${resultId}` → rating. */
  feedback: Map<string, 'useful' | 'not_useful'>
  /** Delay before a confirmed run finishes (ms). */
  runDelay: number
  /** Called when the fake user signs in or out (demo mode keeps it across reloads). */
  onUserChange?: (user: MockState['user']) => void
}

export const mockState: MockState = {
  user: null,
  runs: new Map(),
  results: new Map(),
  feedback: new Map(),
  runDelay: 1500,
}

export const resetMockState = (signedIn = false) => {
  mockState.user = signedIn ? { id: 'user-1', email: 'demo@example.test', name: 'Demo User' } : null
  mockState.runs.clear()
  mockState.results.clear()
  mockState.feedback.clear()
}

/** Stable, path-safe id for a mock result (keys contain slashes). */
const resultId = (r: ScoredResult) => r.key.replace(/[^a-z0-9]/gi, '-')
const withRating = (runId: string, r: ScoredResult) => ({
  ...r,
  id: resultId(r),
  feedback: mockState.feedback.get(`${runId}:${resultId(r)}`) ?? null,
})

const sessionBody = () =>
  mockState.user
    ? {
        user: {
          ...mockState.user,
          emailVerified: false,
          image: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
        session: {
          id: 'session-1',
          userId: mockState.user.id,
          token: 'mock',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
      }
    : null

const host = (q: PlannedQuery): { site: string; offScope: string } => {
  const site =
    q.scope.kind === 'domains'
      ? (q.scope.domains[0]?.replace(/^\*\./, '') ?? 'example.com')
      : q.scope.kind === 'platforms'
        ? ((q.scope.sites[0] ?? 'example.com').split('/')[0] ?? 'example.com')
        : 'en.wikipedia.org'
  return { site: site.includes('.') ? site : `portal.${site}`, offScope: 'news.example.org' }
}

/** Plausible results for a query: mostly in scope, one the "engine" returned off-scope. */
const fakeSearch = async (q: PlannedQuery, page: number): Promise<RawResult[]> => {
  if (page > 1) return []
  const { site, offScope } = host(q)
  const ext = q.signal.filetypes[0]
  const slug = q.templateId.replace(/_/g, '-')
  const results: RawResult[] = Array.from({ length: 5 }, (_, i) => ({
    url: `https://${site}/${slug}/${q.batch}-${i + 1}${ext ? `.${ext}` : ''}`,
    title: `${q.signal.intitle[0] ?? slug.replace(/-/g, ' ')} ${i + 1}`,
    snippet: `Example result for ${q.q}`,
    position: i + 1,
  }))
  results.push({
    url: `https://${offScope}/${slug}`,
    title: 'Related coverage',
    snippet: 'Off-scope example',
    position: 6,
  })
  return results
}

const issuesOf = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }) =>
  error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))

const needUser = () =>
  mockState.user ? null : HttpResponse.json({ ok: false, error: 'Sign in first' }, { status: 401 })

const finishRun = async (id: string) => {
  const run = mockState.runs.get(id)
  if (!run) return
  const out = await runPlan(run.spec, run.plan, { search: fakeSearch })
  const scored = scoreResults(run.spec, out.hits)
  mockState.results.set(id, scored)
  mockState.runs.set(id, {
    ...run,
    status: 'done',
    finishedAt: new Date().toISOString(),
    stats: {
      requests: out.requests,
      fallbackRan: out.fallbackRan,
      errors: out.errors,
      ...summarizeResults(scored),
    },
  })
}

export const handlers = [
  http.get('*/api/auth/get-session', () => HttpResponse.json(sessionBody())),
  http.post('*/api/auth/sign-in/email', async ({ request }) => {
    const { email } = (await request.json()) as { email: string }
    mockState.user = { id: 'user-1', email, name: email.split('@')[0] ?? 'User' }
    mockState.onUserChange?.(mockState.user)
    return HttpResponse.json({ ...sessionBody(), redirect: false, token: 'mock' })
  }),
  http.post('*/api/auth/sign-up/email', async ({ request }) => {
    const { email, name } = (await request.json()) as { email: string; name: string }
    mockState.user = { id: 'user-1', email, name }
    mockState.onUserChange?.(mockState.user)
    return HttpResponse.json({ ...sessionBody(), token: 'mock' })
  }),
  http.post('*/api/auth/sign-out', () => {
    mockState.user = null
    mockState.onUserChange?.(null)
    return HttpResponse.json({ success: true })
  }),

  http.post('*/api/plans', async ({ request }) => {
    const denied = needUser()
    if (denied) return denied
    const parsed = IntakeFormSchema.safeParse(await request.json())
    if (!parsed.success)
      return HttpResponse.json({ ok: false, issues: issuesOf(parsed.error) }, { status: 422 })
    const spec: IntakeSpec = parsed.data
    const selections = ruleBasedSelections(spec)
    const id = crypto.randomUUID()
    const run: RunSummary = {
      id,
      status: 'planned',
      spec,
      selectorSource: 'rules',
      notes: ['Demo mode: default picks, fake search results.', ...routeEngines(spec).notes],
      plan: buildPlan(spec, selections),
      proposedExclusions: spec.avoid
        ? {
            terms: spec.avoid
              .split(/[ ,]+/)
              .filter((w) => w.length > 3)
              .slice(0, 3),
            sites: [],
          }
        : { terms: [], sites: [] },
      followUpQuestion: null,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      startedAt: null,
      finishedAt: null,
      stats: null,
      error: null,
    }
    mockState.runs.set(id, run)
    await delay(300)
    return HttpResponse.json({ ok: true, run }, { status: 201 })
  }),

  http.get('*/api/runs', () => {
    const denied = needUser()
    if (denied) return denied
    const runs = [...mockState.runs.values()].reverse().map((r) => ({
      id: r.id,
      status: r.status,
      goal: r.spec.goal,
      description: r.spec.description,
      createdAt: r.createdAt,
    }))
    return HttpResponse.json({ ok: true, runs })
  }),

  http.get('*/api/runs/:id', ({ params }) => {
    const denied = needUser()
    if (denied) return denied
    const run = mockState.runs.get(String(params.id))
    return run
      ? HttpResponse.json({ ok: true, run })
      : HttpResponse.json({ ok: false, error: 'Run not found' }, { status: 404 })
  }),

  http.post('*/api/runs/:id/confirm', async ({ params, request }) => {
    const denied = needUser()
    if (denied) return denied
    const id = String(params.id)
    const run = mockState.runs.get(id)
    if (!run) return HttpResponse.json({ ok: false, error: 'Run not found' }, { status: 404 })
    if (run.status !== 'planned')
      return HttpResponse.json(
        { ok: false, error: `Run is already ${run.status}` },
        { status: 409 },
      )
    const body = (await request.json()) as { exclusions?: { terms: string[]; sites: string[] } }
    let { spec, plan } = run
    let skipped: string[] = []
    if (body.exclusions && (body.exclusions.terms.length || body.exclusions.sites.length)) {
      const applied = applyExclusions(spec, body.exclusions)
      spec = applied.spec
      skipped = applied.skipped
      plan = buildPlan(spec, ruleBasedSelections(spec))
    }
    const confirmed: RunSummary = {
      ...run,
      spec,
      plan,
      status: 'running',
      confirmedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }
    mockState.runs.set(id, confirmed)
    setTimeout(() => void finishRun(id), mockState.runDelay)
    return HttpResponse.json(
      { ok: true, run: confirmed, skippedExclusions: skipped },
      { status: 202 },
    )
  }),

  http.get('*/api/runs/:id/results', ({ params, request }) => {
    const denied = needUser()
    if (denied) return denied
    const group = new URL(request.url).searchParams.get('group')
    const all = mockState.results.get(String(params.id)) ?? []
    const run = mockState.runs.get(String(params.id))
    return HttpResponse.json({
      ok: true,
      stats: run?.stats ?? null,
      results: (group ? all.filter((r) => r.group === group) : all).map((r) =>
        withRating(String(params.id), r),
      ),
    })
  }),

  http.post('*/api/runs/:id/results/:resultId/feedback', async ({ params, request }) => {
    const denied = needUser()
    if (denied) return denied
    const { value } = (await request.json()) as { value: 'useful' | 'not_useful' | null }
    const key = `${String(params.id)}:${String(params.resultId)}`
    if (value) mockState.feedback.set(key, value)
    else mockState.feedback.delete(key)
    return HttpResponse.json({ ok: true, feedback: value })
  }),

  http.get('*/api/runs/:id/export', ({ params, request }) => {
    const all = mockState.results.get(String(params.id)) ?? []
    if (new URL(request.url).searchParams.get('format') === 'csv') {
      return new HttpResponse(toCsv(all), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      })
    }
    return HttpResponse.json({ results: all })
  }),

  http.get('*/api/locations', ({ request }) => {
    const q = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase()
    const all = [
      'Ahmedabad,Gujarat,India',
      'Mumbai,Maharashtra,India',
      'Bengaluru,Karnataka,India',
      'Delhi,India',
    ]
    return HttpResponse.json({
      ok: true,
      locations: all
        .filter((l) => l.toLowerCase().includes(q))
        .map((canonicalName, i) => ({
          id: i + 1,
          name: canonicalName.split(',')[0],
          canonicalName,
          targetType: 'City',
        })),
    })
  }),
]
