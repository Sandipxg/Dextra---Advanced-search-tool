import { describe, expect, it } from 'vitest'
import {
  type IntakeSpecInput,
  IntakeSpecSchema,
  isSecurityRun,
  needsKeywordFollowUp,
} from './intake-spec'

const basic: IntakeSpecInput = {
  goal: 'documents',
  description: 'Public PDFs and decks from target.com',
}

const securityBase: IntakeSpecInput = {
  goal: 'exposed_pages',
  description: 'Exposed config files on our bug bounty scope',
  use_case: 'bug_bounty',
  scope: { domains: ['target.com'] },
  authorization: { confirmed: true, link: 'https://hackerone.com/target' },
}

/** Paths of all issues, joined with dots, for compact assertions. */
const issuePaths = (input: unknown) => {
  const res = IntakeSpecSchema.safeParse(input)
  return res.success ? [] : res.error.issues.map((i) => i.path.join('.'))
}

describe('basic mode', () => {
  it('fills every advanced field with its default', () => {
    const spec = IntakeSpecSchema.parse(basic)
    expect(spec).toMatchObject({
      goal: 'documents',
      use_case: null,
      scope: { domains: [], subdomains: 'include', mode: 'soft' },
      filters: {
        country: { value: null, mode: 'soft' },
        language: { value: [], mode: 'soft' },
        time: { value: 'any', custom: null, mode: 'soft' },
        content: { value: [], mode: 'soft' },
      },
      keywords: { all: [], any: [], phrases: [], where: 'anywhere', exclude: [] },
      sources: { engines: 'auto', types: ['web'], platforms: { value: [] }, preference: 'none' },
      depth: { level: 'standard', per_query: 20, min_results: 15 },
      show_outside_scope: false,
      output: ['ranked'],
      authorization: null,
    })
  })

  it('accepts the 8 basic fields', () => {
    const spec = IntakeSpecSchema.parse({
      ...basic,
      scope: { domains: ['https://Target.com/'] },
      filters: {
        country: { value: 'in' },
        time: { value: 'qdr:y' },
        content: { value: ['pdf', 'presentation'] },
      },
      depth: { level: 'quick' },
      show_outside_scope: true,
    })
    expect(spec.scope.domains).toEqual(['target.com'])
    expect(spec.filters.content.value).toEqual(['pdf', 'presentation'])
  })

  it('requires A1 and A2', () => {
    expect(issuePaths({ description: 'x' })).toContain('goal')
    expect(issuePaths({ goal: 'documents', description: '   ' })).toContain('description')
    expect(issuePaths({ goal: 'documents', description: 'x'.repeat(301) })).toContain('description')
  })
})

describe('canonical codes only', () => {
  it.each([
    ['country label', { filters: { country: { value: 'India' } } }, 'filters.country.value'],
    ['historic country', { filters: { country: { value: 'uk' } } }, 'filters.country.value'],
    [
      'language label',
      { filters: { language: { value: ['English'] } } },
      'filters.language.value.0',
    ],
    ['time label', { filters: { time: { value: 'past year' } } }, 'filters.time.value'],
    ['file extension', { filters: { content: { value: ['pptx'] } } }, 'filters.content.value.0'],
    ['per_query', { depth: { per_query: 30 } }, 'depth.per_query'],
    ['bad domain', { scope: { domains: ['not a domain'] } }, 'scope.domains.0'],
    ['unknown key kept out', { goal: 'hacking' }, 'goal'],
  ])('rejects %s', (_name, patch, path) => {
    expect(issuePaths({ ...basic, ...patch })).toContain(path)
  })
})

describe('security rules', () => {
  it('accepts a complete bug bounty spec and forces Hard scope', () => {
    const spec = IntakeSpecSchema.parse({
      ...securityBase,
      scope: { domains: ['target.com'], mode: 'open' },
    })
    expect(spec.scope.mode).toBe('hard')
    expect(isSecurityRun(spec)).toBe(true)
  })

  it('requires a security use case for a security goal', () => {
    expect(issuePaths({ ...securityBase, use_case: null })).toContain('use_case')
    expect(issuePaths({ ...securityBase, use_case: 'journalism' })).toContain('use_case')
  })

  it('requires target domains', () => {
    expect(issuePaths({ ...securityBase, scope: { domains: [] } })).toContain('scope.domains')
  })

  it('requires authorization, with a link for bug bounty / pentest', () => {
    expect(issuePaths({ ...securityBase, authorization: null })).toContain('authorization')
    expect(issuePaths({ ...securityBase, authorization: { confirmed: false } })).toContain(
      'authorization.confirmed',
    )
    expect(issuePaths({ ...securityBase, authorization: { confirmed: true } })).toContain(
      'authorization.link',
    )
  })

  it('lets own-org audits confirm without a link', () => {
    const spec = IntakeSpecSchema.parse({
      ...securityBase,
      use_case: 'own_org_audit',
      authorization: { confirmed: true },
    })
    expect(spec.authorization).toEqual({ confirmed: true, link: null })
  })

  it('treats a pentest use case as a security run even on a non-security goal', () => {
    expect(
      issuePaths({
        goal: 'documents',
        description: 'Docs for the engagement',
        use_case: 'authorized_pentest',
      }),
    ).toEqual(expect.arrayContaining(['scope.domains', 'authorization']))
  })

  it('leaves non-security runs at Soft', () => {
    const spec = IntakeSpecSchema.parse({ ...basic, use_case: 'business_research' })
    expect(spec.scope.mode).toBe('soft')
    expect(isSecurityRun(spec)).toBe(false)
  })
})

describe('cross-field rules', () => {
  it('rejects excluded domains that are also targets (after normalising)', () => {
    const paths = issuePaths({
      ...basic,
      scope: {
        domains: ['target.com'],
        exclude_domains: ['blog.target.com', 'HTTPS://target.com'],
      },
      sources: { never: ['target.com'] },
    })
    expect(paths).toEqual(expect.arrayContaining(['scope.exclude_domains.1', 'sources.never.0']))
    expect(paths).not.toContain('scope.exclude_domains.0')
  })

  it('needs a country before a location', () => {
    expect(issuePaths({ ...basic, filters: { location: { value: 'Ahmedabad' } } })).toContain(
      'filters.location.value',
    )
    expect(
      issuePaths({
        ...basic,
        filters: { country: { value: 'in' }, location: { value: 'Ahmedabad' } },
      }),
    ).toEqual([])
  })

  it('validates custom dates', () => {
    const custom = (c: unknown, value = 'custom') =>
      issuePaths({ ...basic, filters: { time: { value, custom: c } } })
    expect(custom(null)).toContain('filters.time.custom')
    expect(custom({ from: '2026-03-01', to: '2026-01-01' })).toContain('filters.time.custom.to')
    expect(custom({ from: '2026-02-30', to: '2026-03-01' })).toContain('filters.time.custom.from')
    expect(custom({ from: '2026-01-01', to: '2026-01-31' }, 'qdr:y')).toContain(
      'filters.time.custom',
    )
    expect(custom({ from: '2026-01-01', to: '2026-01-31' })).toEqual([])
  })

  it('only allows enabled engines', () => {
    expect(issuePaths({ ...basic, sources: { engines: ['google'] } })).toEqual([])
    expect(issuePaths({ ...basic, sources: { engines: ['google', 'bing'] } })).toContain(
      'sources.engines.1',
    )
    expect(issuePaths({ ...basic, sources: { engines: [] } })).toContain('sources.engines')
  })

  it('rejects non-http example URLs', () => {
    expect(
      issuePaths({ ...basic, perfect_result: { example_urls: ['javascript:alert(1)'] } }),
    ).toContain('perfect_result.example_urls.0')
  })
})

describe('needsKeywordFollowUp', () => {
  it('asks only for general research without keywords or phrases', () => {
    const general = IntakeSpecSchema.parse({
      goal: 'general_research',
      description: 'solar subsidies',
    })
    expect(needsKeywordFollowUp(general)).toBe(true)
    const withKeywords = IntakeSpecSchema.parse({
      goal: 'general_research',
      description: 'solar subsidies',
      keywords: { phrases: ['rooftop solar'] },
    })
    expect(needsKeywordFollowUp(withKeywords)).toBe(false)
    expect(needsKeywordFollowUp(IntakeSpecSchema.parse(basic))).toBe(false)
  })
})
