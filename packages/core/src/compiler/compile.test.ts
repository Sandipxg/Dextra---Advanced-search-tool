import { describe, expect, it } from 'vitest'
import { type IntakeSpecInput, IntakeSpecSchema } from '../schema/intake-spec'
import type { TemplateId } from '../templates/index'
import { buildPlan } from './compile'
import type { Selection } from './selection'

const spec = (input: Partial<IntakeSpecInput> = {}) =>
  IntakeSpecSchema.parse({
    goal: 'documents',
    description: 'Public PDFs from target.com',
    scope: { domains: ['target.com'] },
    ...input,
  })

const sel = (templateId: TemplateId, params: Record<string, string[]> = {}): Selection => ({
  templateId,
  params,
  reason: '',
})

const security = {
  goal: 'exposed_pages',
  description: 'Exposed files in scope',
  use_case: 'bug_bounty',
  scope: { domains: ['target.com'] },
  authorization: { confirmed: true, link: 'https://hackerone.com/target' },
} satisfies Partial<IntakeSpecInput>

const primaries = (plan: ReturnType<typeof buildPlan>) =>
  plan.queries.filter((q) => q.batch === 'primary')

describe('layers and order', () => {
  it('builds scope + signal with OR-combined params and a Soft scope fallback', () => {
    const plan = buildPlan(spec(), [sel('doc_by_type', { ext: ['pdf', 'docx'] })])
    expect(plan.queries.map((q) => [q.batch, q.q])).toEqual([
      ['primary', 'site:target.com (filetype:pdf OR filetype:docx)'],
      ['fallback', '(filetype:pdf OR filetype:docx)'],
    ])
    expect(plan.queries[1]).toMatchObject({ widened: ['scope'], scope: { kind: 'any' } })
    expect(plan.queries[0]?.signal.filetypes).toEqual(['pdf', 'docx'])
  })

  it('appends content, keywords and exclusions in that order', () => {
    const plan = buildPlan(
      spec({
        scope: { domains: ['target.com'], exclude_domains: ['blog.target.com'], mode: 'hard' },
        filters: { content: { value: ['spreadsheet'], mode: 'hard' } },
        keywords: {
          all: ['budget'],
          phrases: ['annual plan'],
          exclude: ['careers', 'job openings'],
        },
        sources: { never: ['pinterest.com'] },
      }),
      [sel('co_key_pages', { page: ['investors'] })],
    )
    expect(plan.queries).toHaveLength(1)
    expect(plan.queries[0]?.q).toBe(
      'site:target.com inurl:investors (filetype:xls OR filetype:xlsx OR filetype:ods) budget "annual plan" -site:blog.target.com -site:pinterest.com -careers -"job openings"',
    )
  })

  it('puts keywords in the title or URL when D5 asks', () => {
    const title = buildPlan(spec({ keywords: { all: ['tender'], where: 'title' } }), [
      sel('doc_by_type', { ext: ['pdf'] }),
    ])
    expect(primaries(title)[0]?.q).toBe('site:target.com filetype:pdf intitle:tender')
    const url = buildPlan(spec({ keywords: { phrases: ['annual report'], where: 'url' } }), [
      sel('doc_by_type', { ext: ['pdf'] }),
    ])
    expect(primaries(url)[0]?.q).toBe('site:target.com filetype:pdf inurl:annual inurl:report')
  })

  it('maps location, language and time to API params, not the query', () => {
    const plan = buildPlan(
      spec({
        filters: {
          country: { value: 'in' },
          location: { value: 'Ahmedabad,Gujarat,India', mode: 'hard' },
          language: { value: ['gu', 'en'] },
          time: { value: 'qdr:y' },
        },
      }),
      [sel('doc_by_type', { ext: ['pdf'] })],
    )
    const [primary, fallback] = plan.queries
    expect(primary).toMatchObject({
      country: 'in',
      location: 'Ahmedabad,Gujarat,India',
      language: 'gu',
      time: { kind: 'past', range: 'y' },
    })
    // Fallback drops the Soft ones only; Hard location stays.
    expect(fallback?.widened).toEqual(['scope', 'country', 'language', 'time'])
    expect(fallback).toMatchObject({ location: 'Ahmedabad,Gujarat,India' })
    expect(fallback?.country).toBeUndefined()
    expect(fallback?.time).toBeUndefined()
  })

  it('does not send Open filters at all (re-rank only)', () => {
    const plan = buildPlan(
      spec({
        scope: { domains: ['target.com'], mode: 'open' },
        filters: { country: { value: 'in', mode: 'open' }, time: { value: 'qdr:m', mode: 'open' } },
      }),
      [sel('doc_by_type', { ext: ['pdf'] })],
    )
    expect(plan.queries).toHaveLength(1)
    expect(plan.queries[0]).toMatchObject({ q: 'filetype:pdf', scope: { kind: 'any' } })
    expect(plan.queries[0]?.country).toBeUndefined()
    expect(plan.queries[0]?.time).toBeUndefined()
  })

  it('maps custom dates', () => {
    const plan = buildPlan(
      spec({
        filters: {
          time: { value: 'custom', custom: { from: '2026-01-01', to: '2026-03-31' }, mode: 'hard' },
        },
      }),
      [sel('doc_by_type', { ext: ['pdf'] })],
    )
    expect(plan.queries[0]?.time).toEqual({ kind: 'custom', from: '2026-01-01', to: '2026-03-31' })
  })
})

describe('scope modes', () => {
  it('ORs several target domains and keeps required templates scoped even when B5 is Soft', () => {
    const plan = buildPlan(spec({ scope: { domains: ['a.com', 'b.com'] } }), [
      sel('co_key_pages', { page: ['about'] }),
    ])
    expect(plan.queries.map((q) => q.q)).toEqual(['(site:a.com OR site:b.com) inurl:about'])
  })

  it('handles subdomains-only scope and wildcard domains without site:*.', () => {
    const only = buildPlan(
      spec({ scope: { domains: ['target.com'], subdomains: 'only', mode: 'hard' } }),
      [sel('co_key_pages', { page: ['about'] })],
    )
    expect(only.queries[0]?.q).toBe('site:target.com -site:www.target.com inurl:about')
    const wildcard = buildPlan(spec({ scope: { domains: ['*.target.com'], mode: 'hard' } }), [
      sel('co_key_pages', { page: ['about'] }),
    ])
    expect(wildcard.queries[0]?.q).toBe('site:target.com inurl:about')
    expect(wildcard.queries[0]?.q).not.toContain('*.')
  })

  it('builds subdomain discovery per domain', () => {
    const plan = buildPlan(spec(security), [sel('as_subdomains')])
    expect(plan.queries.map((q) => q.q)).toEqual(['site:target.com -site:www.target.com'])
  })

  it('splits platform templates per site, filling names in quotes', () => {
    const plan = buildPlan(
      spec({ goal: 'third_party_mentions', scope: { names: ['Target Corp'] } }),
      [sel('tp_public_docs', { platform: ['trello.com', 'notion.site'] })],
    )
    expect(plan.queries.map((q) => q.q)).toEqual([
      'site:trello.com "Target Corp"',
      'site:notion.site "Target Corp"',
    ])
    expect(plan.queries[0]?.scope).toEqual({ kind: 'platforms', sites: ['trello.com'] })
  })

  it('ORs platform sites when the template combines with or, and filters regional values', () => {
    const india = spec({
      goal: 'general_research',
      scope: { domains: [] },
      filters: { country: { value: 'in', mode: 'hard' } },
      keywords: { all: ['rooftop', 'solar'] },
    })
    const plan = buildPlan(india, [sel('gr_trusted_domains', { platform: ['gov.in', 'nic.in'] })])
    expect(plan.queries[0]?.q).toBe('(site:gov.in OR site:nic.in) rooftop solar')

    const global = buildPlan(
      { ...india, filters: { ...india.filters, country: { value: null, mode: 'soft' } } },
      [sel('gr_trusted_domains', { platform: ['gov.in'] })],
    )
    expect(global.queries).toHaveLength(0)
    expect(global.dropped[0]?.reason).toMatch(/gov.in.*not allowed/)
  })
})

describe('OR groups', () => {
  it('reuses a template paren group instead of nesting', () => {
    const plan = buildPlan(
      spec({
        goal: 'tech_fingerprinting',
        scope: { domains: ['target.com'], names: ['Target Corp'] },
      }),
      [
        sel('tech_stack_in_jobs', {
          role: ['devops', 'data engineer'],
          tech: ['AWS'],
          platform: ['linkedin.com/jobs', 'indeed.com'],
        }),
      ],
    )
    expect(plan.queries[0]?.q).toBe(
      '(site:linkedin.com/jobs OR site:indeed.com) "Target Corp" ("devops" OR "data engineer") ("AWS")',
    )
  })
})

describe('drops', () => {
  it.each([
    [
      'security template outside a security run',
      spec(),
      sel('exp_config_files', { ext: ['env'] }),
      /authorized security run/,
    ],
    [
      'required scope without domains',
      spec({ scope: { domains: [] } }),
      sel('co_key_pages', { page: ['about'] }),
      /needs target domains/,
    ],
    ['name var without names', spec(), sel('mk_comparisons', { term: ['vs'] }), /needs names/],
    [
      'keywords var without keywords',
      spec({ goal: 'general_research' }),
      sel('gr_keywords'),
      /needs keywords/,
    ],
    ['invented param value', spec(), sel('doc_by_type', { ext: ['exe'] }), /not allowed/],
    [
      'too many values',
      spec(),
      sel('doc_report_kind', { kind: ['annual report', 'whitepaper', 'case study', 'datasheet'] }),
      /max 3/,
    ],
    ['missing param', spec(), sel('doc_by_type'), /missing param ext/],
    [
      'unknown param',
      spec(),
      sel('doc_by_type', { ext: ['pdf'], site: ['evil.com'] }),
      /unknown param site/,
    ],
  ])('drops %s', (_name, s, selection, reason) => {
    const plan = buildPlan(s, [selection])
    expect(plan.queries).toHaveLength(0)
    expect(plan.dropped[0]?.reason).toMatch(reason)
  })

  it('runs security templates in an authorized security run with Hard scope and no fallback', () => {
    const plan = buildPlan(spec(security), [sel('exp_config_files', { ext: ['env', 'ini'] })])
    expect(plan.queries.map((q) => [q.batch, q.q])).toEqual([
      ['primary', 'site:target.com (filetype:env OR filetype:ini)'],
    ])
  })
})

describe('keywords stand in for names (D-026)', () => {
  it('fills {name} from keywords and does not repeat them', () => {
    const plan = buildPlan(
      spec({ goal: 'news_mentions', scope: { domains: [] }, keywords: { all: ['Infosys'] } }),
      [sel('nw_name_news')],
    )
    expect(plan.queries.map((q) => q.q)).toEqual(['"Infosys"'])
  })

  it('prefers real names when given, and keeps the keyword layer', () => {
    const plan = buildPlan(
      spec({
        goal: 'third_party_mentions',
        scope: { domains: [], names: ['Infosys'] },
        keywords: { all: ['layoffs'] },
      }),
      [sel('tp_forums', { platform: ['reddit.com'] })],
    )
    expect(plan.queries[0]?.q).toBe('site:reddit.com "Infosys" layoffs')
  })
})

describe('injection through spec text (D-008)', () => {
  it('keeps a hostile name as one quoted literal', () => {
    const plan = buildPlan(
      spec({ goal: 'third_party_mentions', scope: { names: ['x" site:evil.com OR "y'] } }),
      [sel('tp_forums', { platform: ['reddit.com'] })],
    )
    expect(plan.queries[0]?.q).toBe('site:reddit.com "x site:evil.com OR y"')
    expect(plan.rejected).toEqual([])
  })

  it('quotes keywords that look like operators', () => {
    const plan = buildPlan(spec({ keywords: { all: ['site:evil.com', '-secret', 'OR'] } }), [
      sel('doc_by_type', { ext: ['pdf'] }),
    ])
    expect(primaries(plan)[0]?.q).toBe(
      'site:target.com filetype:pdf "site:evil.com" "-secret" "OR"',
    )
  })
})

describe('budget and batches', () => {
  const many = Array.from({ length: 12 }, () => sel('doc_by_type', { ext: ['pdf'] }))

  it('caps primaries at the depth budget and reports the rest', () => {
    const plan = buildPlan(spec({ depth: { level: 'quick' } }), many)
    expect(primaries(plan)).toHaveLength(10)
    expect(plan.budget).toBe(10)
    expect(plan.dropped).toEqual([
      { templateId: 'doc_by_type', reason: '2 queries over the quick budget' },
    ])
  })

  it('runs higher-priority templates first', () => {
    const plan = buildPlan(spec({ depth: { level: 'quick' } }), [
      ...Array.from({ length: 10 }, () => sel('doc_data_files', { ext: ['csv'] })), // priority 3
      sel('doc_by_type', { ext: ['pdf'] }), // priority 1
    ])
    expect(primaries(plan)[0]?.templateId).toBe('doc_by_type')
  })

  it('limits borrowed templates to 30% of the budget (D-010)', () => {
    const borrowed = Array.from({ length: 5 }, () => sel('co_key_pages', { page: ['about'] }))
    const plan = buildPlan(spec({ depth: { level: 'quick' } }), borrowed)
    expect(primaries(plan)).toHaveLength(3)
    expect(primaries(plan).every((q) => q.crossGoal)).toBe(true)
  })

  it('turns the first ~20% of widenable queries into an outside batch when F4 is on', () => {
    const plan = buildPlan(
      spec({ depth: { level: 'quick' }, show_outside_scope: true }),
      many.slice(0, 4),
    )
    expect(plan.queries.map((q) => q.batch)).toEqual([
      'primary',
      'outside',
      'primary',
      'outside',
      'primary',
      'fallback',
      'primary',
      'fallback',
    ])
  })

  it('counts requests in pages of 10 (D-017)', () => {
    const plan = buildPlan(spec({ depth: { per_query: 50 } }), [
      sel('doc_by_type', { ext: ['pdf'] }),
    ])
    expect(plan.queries[0]?.pages).toBe(5)
    expect(plan.requests).toBe(5)
    expect(plan.maxFallbackRequests).toBe(5)
  })

  it('summarises strictness for the pre-run summary', () => {
    const plan = buildPlan(spec({ filters: { country: { value: 'in', mode: 'hard' } } }), [])
    expect(plan.strictness).toEqual({
      scope: 'soft',
      country: 'hard',
      location: 'n/a',
      language: 'n/a',
      time: 'n/a',
      content: 'n/a',
    })
  })
})

describe('every approved template compiles cleanly', async () => {
  const { approvedTemplates, paramValuesFor } = await import('../templates/index')

  // Each template under its own goal (so the cross-goal cap doesn't apply), inside an
  // authorized security run so security templates are allowed, with every var available.
  it.each(approvedTemplates().map((t) => [t.id, t] as const))('%s', (_id, t) => {
    const full = spec({
      ...security,
      goal: t.goal,
      scope: { domains: ['target.com'], names: ['Target Corp'] },
      filters: { country: { value: 'in' } },
      keywords: { all: ['report'] },
    })
    const params = Object.fromEntries(
      Object.entries(paramValuesFor(t, 'in')).map(([k, v]) => [k, v.slice(0, t.max_pick)]),
    )
    const plan = buildPlan(full, [sel(t.id as TemplateId, params)])
    expect(plan.rejected).toEqual([])
    expect(plan.dropped).toEqual([])
    expect(primaries(plan).length).toBeGreaterThan(0)
  })
})
