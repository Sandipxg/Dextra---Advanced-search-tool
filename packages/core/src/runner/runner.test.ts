import { describe, expect, it, vi } from 'vitest'
import { buildPlan } from '../compiler/compile'
import type { Selection } from '../compiler/selection'
import type { PlannedQuery } from '../compiler/types'
import { type IntakeSpecInput, IntakeSpecSchema } from '../schema/intake-spec'
import { csvCell, groupByGoal, summarizeResults, toCsv } from './report'
import { runPlan } from './run'
import {
  ENGINE_IGNORED_SCOPE,
  LOOSE_MATCH,
  OUTSIDE_LABELS,
  scoreResults,
  UNVERIFIED,
} from './score'
import type { Hit, RawResult } from './types'
import { normalizeUrl } from './url'

const spec = (input: Partial<IntakeSpecInput> = {}) =>
  IntakeSpecSchema.parse({
    goal: 'documents',
    description: 'PDFs',
    scope: { domains: ['target.com'] },
    ...input,
  })

const docs: Selection = { templateId: 'doc_by_type', params: { ext: ['pdf'] }, reason: '' }

const results = (n: number, prefix = 'https://target.com/doc'): RawResult[] =>
  Array.from({ length: n }, (_, i) => ({
    url: `${prefix}${i}.pdf`,
    title: `Doc ${i}`,
    snippet: '',
    position: i + 1,
  }))

describe('normalizeUrl', () => {
  it.each([
    ['https://www.Target.com/a/?utm_source=x&b=2&a=1#top', 'target.com/a?a=1&b=2'],
    ['http://target.com/', 'target.com'],
    ['https://target.com:443/a//b/', 'target.com/a/b'],
    ['https://target.com/a?gclid=1', 'target.com/a'],
    ['javascript:alert(1)', null],
    ['not a url', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected)
  })
})

describe('runPlan', () => {
  it('pages until a short page and counts requests', async () => {
    const s = spec({ depth: { per_query: 50, min_results: 1 } })
    const plan = buildPlan(s, [docs])
    const search = vi.fn(async (_q: PlannedQuery, page: number) =>
      page < 3
        ? results(10, `https://target.com/p${page}-`)
        : results(4, `https://target.com/p${page}-`),
    )
    const out = await runPlan(s, plan, { search })
    expect(search.mock.calls.map(([, page]) => page)).toEqual([1, 2, 3])
    expect(out.requests).toBe(3)
    expect(out.hits).toHaveLength(24)
    expect(out.fallbackRan).toBe(false)
  })

  it('runs the Soft fallback only when primary in-scope results fall short of F3', async () => {
    const s = spec({ depth: { min_results: 5 } })
    const plan = buildPlan(s, [docs])
    const few = vi.fn(async (q: PlannedQuery) =>
      q.batch === 'primary' ? results(2) : results(3, 'https://other.org/x'),
    )
    const short = await runPlan(s, plan, { search: few })
    expect(short.fallbackRan).toBe(true)
    expect(few).toHaveBeenCalledTimes(2)

    const enough = vi.fn(async () => results(8))
    const full = await runPlan(s, plan, { search: enough })
    expect(full.fallbackRan).toBe(false)
    expect(enough).toHaveBeenCalledTimes(1)
  })

  it('does not count results the engine returned off-scope toward F3', async () => {
    const s = spec({ depth: { min_results: 3 } })
    const plan = buildPlan(s, [docs])
    const search = vi.fn(async () => results(5, 'https://wired.com/x'))
    expect((await runPlan(s, plan, { search })).fallbackRan).toBe(true)
  })

  it('records a failing query and keeps going', async () => {
    const s = spec({ depth: { min_results: 1 } })
    const plan = buildPlan(s, [
      docs,
      { templateId: 'doc_data_files', params: { ext: ['csv'] }, reason: '' },
    ])
    const search = vi.fn(async (q: PlannedQuery) => {
      if (q.templateId === 'doc_data_files') throw new Error('[serpapi] HTTP 500')
      return results(3)
    })
    const out = await runPlan(s, plan, { search })
    expect(out.errors).toEqual([{ queryKey: 'doc_data_files#1', message: '[serpapi] HTTP 500' }])
    expect(out.hits).toHaveLength(3)
  })

  it('limits parallel requests', async () => {
    const s = spec({ depth: { level: 'quick' } })
    const plan = buildPlan(
      s,
      Array.from({ length: 8 }, () => docs),
    )
    let inFlight = 0
    let peak = 0
    const search = async () => {
      peak = Math.max(peak, ++inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return results(10)
    }
    await runPlan(s, plan, { search, concurrency: 3 })
    expect(peak).toBe(3)
  })
})

describe('scoreResults', () => {
  const hit = (q: PlannedQuery, url: string, position = 1, title = 'T', page = 1): Hit => ({
    query: q,
    page,
    result: { url, title, snippet: '', position },
  })

  it('dedupes across queries and ranks repeated, higher results first', () => {
    const s = spec()
    const [q1] = buildPlan(s, [docs]).queries
    const q2 = { ...(q1 as PlannedQuery), key: 'doc_by_type#2' }
    const scored = scoreResults(s, [
      hit(q1 as PlannedQuery, 'https://target.com/a.pdf', 3),
      hit(q2, 'https://www.target.com/a.pdf?utm_source=x', 1),
      hit(q1 as PlannedQuery, 'https://target.com/b.pdf', 1),
    ])
    expect(scored.map((r) => [r.key, r.queryKeys.length, r.bestPosition])).toEqual([
      ['target.com/a.pdf', 2, 1],
      ['target.com/b.pdf', 1, 1],
    ])
    expect(scored[0]?.url).toBe('https://www.target.com/a.pdf?utm_source=x')
  })

  it('ranks results with the required keywords above ones missing them and flags the loose ones (T-023)', () => {
    const s = spec({ keywords: { all: ['shiddat'] } })
    const [q] = buildPlan(s, [docs]).queries
    const scored = scoreResults(s, [
      hit(q as PlannedQuery, 'https://target.com/other.pdf', 1, 'Annual report'),
      hit(q as PlannedQuery, 'https://target.com/shiddat.pdf', 2, 'Shiddat review'),
    ])
    expect(scored[0]?.key).toBe('target.com/shiddat.pdf')
    expect(scored.find((r) => r.key === 'target.com/other.pdf')?.reasons).toContain(LOOSE_MATCH)
    expect(scored.find((r) => r.key === 'target.com/shiddat.pdf')?.reasons).not.toContain(
      LOOSE_MATCH,
    )
  })

  it('ignores intent words like "download" when scoring keyword relevance (T-023)', () => {
    const s = spec({ keywords: { all: ['shiddat', 'download'] } })
    const [q] = buildPlan(s, [docs]).queries
    // "download" absent from the page must not flag it loose; "shiddat" is present.
    const [r] = scoreResults(s, [hit(q as PlannedQuery, 'https://target.com/shiddat.pdf', 1)])
    expect(r?.reasons).not.toContain(LOOSE_MATCH)
  })

  it('puts off-scope primary results in Outside (Soft), drops them (Hard), lists them unverified (security)', () => {
    const soft = spec()
    const [qs] = buildPlan(soft, [docs]).queries
    expect(
      scoreResults(soft, [hit(qs as PlannedQuery, 'https://wired.com/x.pdf')])[0],
    ).toMatchObject({
      group: 'outside',
      reasons: [ENGINE_IGNORED_SCOPE],
    })

    const hard = spec({ scope: { domains: ['target.com'], mode: 'hard' } })
    const [qh] = buildPlan(hard, [docs]).queries
    expect(scoreResults(hard, [hit(qh as PlannedQuery, 'https://wired.com/x.pdf')])).toEqual([])

    const sec = spec({
      goal: 'exposed_pages',
      use_case: 'bug_bounty',
      authorization: { confirmed: true, link: 'https://hackerone.com/t' },
    })
    const [qsec] = buildPlan(sec, [
      { templateId: 'exp_config_files', params: { ext: ['env'] }, reason: '' },
    ]).queries
    expect(
      scoreResults(sec, [hit(qsec as PlannedQuery, 'https://target-cdn.net/.env')])[0],
    ).toMatchObject({
      group: 'unverified',
      reasons: [UNVERIFIED],
    })
  })

  it('labels fallback results by what was widened, but not scope for in-scope hosts', () => {
    const s = spec({ filters: { country: { value: 'in' } } })
    const fallback = buildPlan(s, [docs]).queries.find(
      (q) => q.batch === 'fallback',
    ) as PlannedQuery
    const [outside, inDomain] = scoreResults(s, [
      hit(fallback, 'https://other.org/x.pdf', 1),
      hit(fallback, 'https://target.com/y.pdf', 2),
    ])
    expect(outside?.reasons).toEqual([OUTSIDE_LABELS.scope, OUTSIDE_LABELS.country])
    expect(inDomain?.reasons).toEqual([OUTSIDE_LABELS.country])
  })

  it('promotes a result found by a primary query to main', () => {
    const s = spec()
    const [primary, fallback] = buildPlan(s, [docs]).queries as [PlannedQuery, PlannedQuery]
    const [r] = scoreResults(s, [
      hit(fallback, 'https://target.com/a.pdf'),
      hit(primary, 'https://target.com/a.pdf', 4),
    ])
    expect(r).toMatchObject({ group: 'main', reasons: [] })
  })

  it('drops never-show hosts and URLs the user already has (B6)', () => {
    const s = spec({
      scope: {
        domains: ['target.com'],
        exclude_domains: ['blog.target.com'],
        known_urls: ['https://target.com/old.pdf'],
      },
    })
    const [q] = buildPlan(s, [docs]).queries
    const scored = scoreResults(s, [
      hit(q as PlannedQuery, 'https://blog.target.com/x.pdf'),
      hit(q as PlannedQuery, 'https://www.target.com/old.pdf'),
      hit(q as PlannedQuery, 'https://target.com/new.pdf'),
    ])
    expect(scored.map((r) => r.key)).toEqual(['target.com/new.pdf'])
  })

  it('rewards signal matches and Open-filter / preference bonuses', () => {
    const s = spec({ keywords: { any: ['budget'] }, sources: { preference: 'official_first' } })
    const [q] = buildPlan(s, [docs]).queries
    const [a, b] = scoreResults(s, [
      hit(q as PlannedQuery, 'https://target.com/a.html', 1, 'Plan'),
      hit(q as PlannedQuery, 'https://target.com/b.pdf', 1, 'Budget 2026'),
    ])
    expect(a?.key).toBe('target.com/b.pdf')
    // 10 (one query) + 10 (position 1) + 5 (pdf match) + 2 (budget) + 4 (official)
    expect(a?.score).toBe(31)
    expect(b?.signal).toBe('miss')
  })
})

describe('reports', () => {
  it('neutralises spreadsheet formulas and quotes CSV cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell(12.5)).toBe('12.5')
  })

  it('writes CSV rows and groups main results by goal', () => {
    const s = spec()
    const [q] = buildPlan(s, [docs]).queries
    const scored = scoreResults(s, [
      {
        query: q as PlannedQuery,
        page: 1,
        result: { url: 'https://target.com/a.pdf', title: 'A, annual', snippet: '', position: 1 },
      },
    ])
    const csv = toCsv(scored)
    expect(csv.split('\r\n')[0]).toBe(
      'rank,group,score,title,url,snippet,reasons,templates,date,source',
    )
    expect(csv.split('\r\n')[1]).toBe(
      '1,main,25,"A, annual",https://target.com/a.pdf,,,doc_by_type,,',
    )
    expect(Object.keys(groupByGoal(scored))).toEqual(['documents'])
    expect(summarizeResults(scored)).toEqual({ main: 1, outside: 0, unverified: 0 })
  })
})
