import { describe, expect, it } from 'vitest'
import type { PlannedQuery } from '../compiler/types'
import { checkQuery } from './query-guard'
import { checkResult } from './result-guard'

const ctx = { scopeDomains: ['target.com', '*.corp.io'], platformSites: [] as string[] }

describe('checkQuery', () => {
  it.each([
    'site:target.com filetype:pdf',
    'site:docs.target.com intitle:"annual report"',
    '(site:target.com OR site:corp.io) inurl:login',
    'site:api.corp.io -site:www.target.com -site:anything.com',
    '"Warning: mysql_" site:target.com',
    '"x site:evil.com OR y"',
    'site:target.com "phpinfo()"',
  ])('allows %s', (q) => {
    expect(checkQuery(q, ctx)).toEqual([])
  })

  it.each([
    ['out-of-scope site', 'site:evil.com', /site:evil.com is outside/],
    ['lookalike suffix', 'site:target.com.evil.com', /outside/],
    ['lookalike prefix', 'site:eviltarget.com', /outside/],
    ['site inside OR group', '(site:target.com OR site:evil.com)', /site:evil.com/],
    ['ext:', 'site:target.com ext:pdf', /ext: is not allowed/],
    ['intext:', 'site:target.com intext:"x"', /intext: is not allowed/],
    ['retired operator', 'cache:target.com', /cache: is not allowed/],
    ['negated unknown operator', 'site:target.com -related:x.com', /related: is not allowed/],
    ['unfilled placeholder', 'site:target.com filetype:{ext}', /placeholder/],
    ['unbalanced quotes', 'site:target.com "open', /unbalanced/],
    ['too many words', `site:target.com ${'w '.repeat(32)}`, /32 words/],
  ])('rejects %s', (_name, q, pattern) => {
    expect(checkQuery(q, ctx).some((v) => pattern.test(v))).toBe(true)
  })

  it('allows a platform site only for the template that picked it (D-007)', () => {
    expect(checkQuery('site:github.com "target.com"', ctx)).toHaveLength(1)
    expect(
      checkQuery('site:github.com "target.com"', { ...ctx, platformSites: ['github.com'] }),
    ).toEqual([])
    expect(
      checkQuery('site:linkedin.com/jobs "x"', { ...ctx, platformSites: ['linkedin.com/jobs'] }),
    ).toEqual([])
  })
})

const query = (patch: Partial<PlannedQuery>): PlannedQuery => ({
  key: 'doc_by_type#1',
  templateId: 'doc_by_type',
  goal: 'documents',
  priority: 1,
  crossGoal: false,
  q: '',
  engine: 'google',
  type: 'web',
  pages: 1,
  batch: 'primary',
  widened: [],
  scope: { kind: 'domains', domains: ['target.com'], subdomains: 'include' },
  excludedHosts: [],
  signal: { filetypes: [], inurl: [], intitle: [] },
  ...patch,
})

describe('checkResult (D-016)', () => {
  it('flags results the engine returned outside scope', () => {
    const q = query({})
    expect(checkResult(q, 'https://docs.target.com/a', '').inScope).toBe(true)
    expect(checkResult(q, 'https://www.wired.com/tag/target', '').inScope).toBe(false)
    expect(checkResult(q, 'https://target.com.evil.com/', '').inScope).toBe(false)
  })

  it('honours B2 main-only / subdomains-only and wildcards', () => {
    const main = query({
      scope: { kind: 'domains', domains: ['target.com'], subdomains: 'exclude' },
    })
    expect(checkResult(main, 'https://www.target.com/x', '').inScope).toBe(true)
    expect(checkResult(main, 'https://blog.target.com/x', '').inScope).toBe(false)
    const only = query({ scope: { kind: 'domains', domains: ['target.com'], subdomains: 'only' } })
    expect(checkResult(only, 'https://target.com/x', '').inScope).toBe(false)
    expect(checkResult(only, 'https://api.target.com/x', '').inScope).toBe(true)
    const wildcard = query({
      scope: { kind: 'domains', domains: ['*.target.com'], subdomains: 'include' },
    })
    expect(checkResult(wildcard, 'https://www.target.com/', '').inScope).toBe(false)
  })

  it('checks platform hosts, path prefixes and TLD sites', () => {
    const jobs = query({ scope: { kind: 'platforms', sites: ['linkedin.com/jobs'] } })
    expect(checkResult(jobs, 'https://in.linkedin.com/jobs/view/1', '').inScope).toBe(true)
    expect(checkResult(jobs, 'https://linkedin.com/in/someone', '').inScope).toBe(false)
    const gov = query({ scope: { kind: 'platforms', sites: ['gov.in'] } })
    expect(checkResult(gov, 'https://mnre.gov.in/scheme', '').inScope).toBe(true)
    expect(checkResult(gov, 'https://notgov.in/', '').inScope).toBe(false)
  })

  it('marks never-show hosts and non-http URLs', () => {
    const q = query({ scope: { kind: 'any' }, excludedHosts: ['pinterest.com'] })
    expect(checkResult(q, 'https://in.pinterest.com/pin/1', '').excluded).toBe(true)
    expect(checkResult(q, 'javascript:alert(1)', '')).toEqual({
      inScope: false,
      excluded: false,
      signal: 'unknown',
    })
  })

  it('checks the signal where it can', () => {
    const pdf = query({ signal: { filetypes: ['pdf'], inurl: [], intitle: [] } })
    expect(checkResult(pdf, 'https://target.com/a.pdf', '').signal).toBe('match')
    expect(checkResult(pdf, 'https://target.com/a.html', '').signal).toBe('miss')
    expect(checkResult(pdf, 'https://target.com/internal_resources/903/', '').signal).toBe(
      'unknown',
    )
    const login = query({ signal: { filetypes: [], inurl: ['login'], intitle: ['Sign in'] } })
    expect(checkResult(login, 'https://target.com/login', 'Sign in to Target').signal).toBe('match')
    expect(checkResult(login, 'https://target.com/login', 'Home').signal).toBe('miss')
  })
})
