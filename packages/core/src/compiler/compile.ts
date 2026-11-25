import { checkQuery } from '../guardrails/query-guard'
import { filetypeLayerExtensions } from '../schema/content-types'
import {
  DEPTH_BUDGET,
  ENABLED_ENGINES,
  type Engine,
  pagesPerQuery,
  type Strictness,
} from '../schema/enums'
import type { Goal } from '../schema/goal'
import { type IntakeSpec, isSecurityRun } from '../schema/intake-spec'
import { getTemplate, type Template } from '../templates/index'
import { compileExcludedTerms, compileKeywordsVar, compileRequiredKeywords } from './keywords'
import { type Selection, validateSelection } from './selection'
import { baseHost, GOOGLE_WORD_LIMIT, join, orGroup, phrase, tokenize, wordCount } from './tokens'
import type {
  DroppedTemplate,
  Plan,
  PlannedQuery,
  RejectedQuery,
  ResultScope,
  SignalCheck,
  TimeFilter,
  WidenableFilter,
} from './types'

/** Goals whose templates take the D1 content filter as an extra `filetype:` layer. */
const CONTENT_FILTER_GOALS: readonly Goal[] = [
  'documents',
  'general_research',
  'company_research',
  'competitor_research',
]
/** Caps so one template can't eat the budget before priorities are applied. */
const MAX_QUERIES_PER_TEMPLATE = 10
const MAX_VAR_FANOUT = 3
const DOMAINS_PER_QUERY = 5
/** F4 outside-scope batch share (D-003) and cross-goal share (D-010). */
const OUTSIDE_SHARE = 0.2
const CROSS_GOAL_SHARE = 0.3

type Assign = Record<string, string>

const cartesian = (lists: Array<[string, readonly string[]]>, cap: number): Assign[] => {
  let combos: Assign[] = [{}]
  for (const [key, values] of lists) {
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v }))).slice(0, cap)
  }
  return combos
}

/** Placeholder sits inside a quoted part of the token? */
const insideQuotes = (token: string, index: number) =>
  (token.slice(0, index).match(/"/g)?.length ?? 0) % 2 === 1

/**
 * Params are raw enum values: a spaced value outside quotes gets quoted. Vars are already
 * compiled fragments (quoted names, keyword layer), so they go in unchanged.
 */
const renderToken = (token: string, params: Assign, vars: Assign): string =>
  token.replace(/\{([a-z_]+)\}/g, (whole, key: string, index: number) => {
    const varValue = vars[key]
    if (varValue !== undefined) return varValue
    const value = params[key]
    if (value === undefined) return whole
    return !insideQuotes(token, index) && /\s/.test(value) ? `"${value}"` : value
  })

/**
 * Fills the template's signal. `or` keeps one query and turns multi-value params into
 * `(a OR b)` at token level (Google's OR binds tighter than AND); `split` makes one query per
 * value combination. `or` falls back to `split` past Google's word limit (D-009).
 */
const renderSignal = (
  query: string,
  params: Record<string, string[]>,
  vars: Assign,
  combine: 'or' | 'split',
): string[] => {
  const paramLists = Object.entries(params).filter(([k]) => k !== 'platform')
  const split = () =>
    cartesian(paramLists, MAX_QUERIES_PER_TEMPLATE).map((a) =>
      tokenize(query)
        .map((t) => renderToken(t, a, vars))
        .join(' '),
    )
  if (combine === 'split') return split()

  const rendered = tokenize(query)
    .map((token) => {
      const inToken = paramLists.filter(([k]) => token.includes(`{${k}}`))
      // A template's own `(...)` around a placeholder becomes the OR group's parens.
      const wrapped = token.startsWith('(') && token.endsWith(')')
      const inner = wrapped ? token.slice(1, -1) : token
      const variants = cartesian(inToken, MAX_QUERIES_PER_TEMPLATE).map((a) =>
        renderToken(inner, a, vars),
      )
      return wrapped && variants.length === 1 ? `(${variants[0]})` : orGroup(variants)
    })
    .join(' ')
  return wordCount(rendered) > GOOGLE_WORD_LIMIT ? split() : [rendered]
}

const signalOperatorValues = (template: Template, params: Record<string, string[]>, op: string) =>
  tokenize(template.query).flatMap((token) => {
    const m = token.match(new RegExp(`${op}:"?\\{([a-z_]+)\\}`))
    return m?.[1] ? (params[m[1]] ?? []) : []
  })

const toTimeFilter = (time: IntakeSpec['filters']['time']): TimeFilter | undefined => {
  if (time.value === 'any') return undefined
  if (time.value === 'custom') {
    return time.custom ? { kind: 'custom', from: time.custom.from, to: time.custom.to } : undefined
  }
  return { kind: 'past', range: time.value.slice(4) as 'd' | 'w' | 'm' | 'y' }
}

export const pickEngine = (template: Template, spec: IntakeSpec): Engine | null => {
  const enabled = template.engines.filter((e) => (ENABLED_ENGINES as readonly string[]).includes(e))
  const wanted =
    spec.sources.engines === 'auto'
      ? enabled
      : enabled.filter((e) => spec.sources.engines.includes(e))
  return wanted[0] ?? null
}

/** A compiled query plus what's needed to widen it later. */
interface Candidate {
  query: Omit<PlannedQuery, 'key' | 'batch' | 'widened'>
  parts: { scope: string; signal: string; content: string; keywords: string; exclusions: string }
  soft: WidenableFilter[]
  platformSites: string[]
  order: number
}

type CompileResult = { candidates: Candidate[] } | { drop: string }

const compileTemplate = (
  spec: IntakeSpec,
  template: Template,
  selection: Selection,
  engine: Engine,
  order: number,
): CompileResult => {
  const domains = [...new Set(spec.scope.domains.map(baseHost))]
  const uses = (v: 'name' | 'domain' | 'keywords') => template.vars.includes(v)

  // Vars (D-008): filled by code from the spec only.
  // No names given (the form no longer asks, D-026): a name template uses the FIRST keyword
  // (or phrase) as the name and keeps the remaining keywords as the ANDed keyword layer.
  // It must never fan out into one query per keyword — that produced `site:g2.com "customer"`
  // and other off-topic queries (T-023).
  const namesFromKeywords = uses('name') && spec.scope.names.length === 0
  const derivedName = spec.keywords.all[0] ?? spec.keywords.phrases[0]
  const names = (namesFromKeywords ? (derivedName ? [derivedName] : []) : spec.scope.names).slice(
    0,
    MAX_VAR_FANOUT,
  )
  if (uses('name') && names.length === 0) return { drop: 'needs names, brands or keywords' }
  // Keywords left after the first was spent as the name; appended as the AND layer below.
  const leftoverKeywords: IntakeSpec['keywords'] = namesFromKeywords
    ? {
        ...spec.keywords,
        all: spec.keywords.all.length ? spec.keywords.all.slice(1) : spec.keywords.all,
        phrases: spec.keywords.all.length ? spec.keywords.phrases : spec.keywords.phrases.slice(1),
      }
    : spec.keywords
  if (uses('domain') && domains.length === 0) return { drop: 'needs target domains (B1)' }
  const keywordsVar = compileKeywordsVar(spec.keywords)
  if (uses('keywords') && !keywordsVar) return { drop: 'needs keywords (D2–D4)' }
  if (['required', 'subdomains'].includes(template.scope_mode) && domains.length === 0) {
    return { drop: 'needs target domains (B1)' }
  }

  const varCombos = cartesian(
    [
      ['name', uses('name') ? names.map(phrase) : ['']],
      ['domain', uses('domain') ? domains.slice(0, MAX_VAR_FANOUT) : ['']],
    ],
    MAX_QUERIES_PER_TEMPLATE,
  ).map((a) => ({ ...a, keywords: keywordsVar }))

  // Scope layer.
  const platformSites = selection.params.platform ?? []
  const scopeMode = spec.scope.mode
  const soft: WidenableFilter[] = []
  let scopeParts: Array<{ part: string; scope: ResultScope }>
  const domainScope = (list: string[]): ResultScope => ({
    kind: 'domains',
    domains: list,
    subdomains: spec.scope.subdomains,
  })
  const domainPart = (chunk: string[]) => {
    const notWww = spec.scope.subdomains === 'only' ? chunk.map((d) => `-site:www.${d}`) : []
    return join(orGroup(chunk.map((d) => `site:${d}`)), ...notWww)
  }
  const chunks: string[][] = []
  for (let i = 0; i < domains.length; i += DOMAINS_PER_QUERY) {
    chunks.push(domains.slice(i, i + DOMAINS_PER_QUERY))
  }

  switch (template.scope_mode) {
    case 'required':
      // Required-scope templates are always scoped, whatever B5 says (D-020).
      scopeParts = chunks.map((c) => ({ part: domainPart(c), scope: domainScope(c) }))
      break
    case 'subdomains':
      scopeParts = domains.map((d) => ({
        part: `site:${d} -site:www.${d}`,
        scope: { kind: 'domains', domains: [d], subdomains: 'only' },
      }))
      break
    case 'optional':
      if (domains.length && scopeMode !== 'open') {
        scopeParts = chunks.map((c) => ({ part: domainPart(c), scope: domainScope(c) }))
        if (scopeMode === 'soft') soft.push('scope')
      } else {
        scopeParts = [{ part: '', scope: { kind: 'any' } }]
      }
      break
    case 'platform':
      scopeParts =
        template.combine === 'or'
          ? [
              {
                part: orGroup(platformSites.map((s) => `site:${s}`)),
                scope: { kind: 'platforms', sites: platformSites },
              },
            ]
          : platformSites.map((s) => ({
              part: `site:${s}`,
              scope: { kind: 'platforms', sites: [s] },
            }))
      break
    case 'none':
      scopeParts = [{ part: '', scope: { kind: 'any' } }]
      break
  }

  // Content layer (D1).
  const contentFilter = spec.filters.content
  const contentExts =
    CONTENT_FILTER_GOALS.includes(template.goal) &&
    !template.query.includes('filetype:') &&
    contentFilter.mode !== 'open' &&
    contentFilter.value.length > 0 &&
    !contentFilter.value.includes('web')
      ? filetypeLayerExtensions(contentFilter.value)
      : []
  const content = orGroup(contentExts.map((e) => `filetype:${e}`))
  if (content && contentFilter.mode === 'soft') soft.push('content')

  // Keywords + exclusions.
  // The {keywords} var already carries the keyword layer; otherwise append it here. For a
  // keyword-derived name, the first keyword became the name, so only the leftovers are added.
  const keywords = uses('keywords') ? '' : compileRequiredKeywords(leftoverKeywords)
  const excludedHosts = [
    ...new Set([...spec.scope.exclude_domains, ...spec.sources.never].map(baseHost)),
  ]
  const exclusions = join(
    ...excludedHosts.map((h) => `-site:${h}`),
    compileExcludedTerms(spec.keywords),
  )

  // API-parameter filters (D-003: Open = re-rank only, so not sent).
  const f = spec.filters
  const country = f.country.mode !== 'open' ? (f.country.value ?? undefined) : undefined
  const location =
    country && f.location.mode !== 'open' ? (f.location.value ?? undefined) : undefined
  const language = f.language.mode !== 'open' ? f.language.value[0] : undefined
  const time = f.time.mode !== 'open' ? toTimeFilter(f.time) : undefined
  if (country && f.country.mode === 'soft') soft.push('country')
  if (location && f.location.mode === 'soft') soft.push('location')
  if (language && f.language.mode === 'soft') soft.push('language')
  if (time && f.time.mode === 'soft') soft.push('time')

  const signal: SignalCheck = {
    filetypes: [...signalOperatorValues(template, selection.params, 'filetype'), ...contentExts],
    inurl: signalOperatorValues(template, selection.params, 'inurl'),
    intitle: signalOperatorValues(template, selection.params, 'intitle'),
  }

  const candidates: Candidate[] = []
  for (const vars of varCombos) {
    for (const sig of renderSignal(template.query, selection.params, vars, template.combine)) {
      for (const { part, scope } of scopeParts) {
        if (candidates.length >= MAX_QUERIES_PER_TEMPLATE) break
        const parts = { scope: part, signal: sig, content, keywords, exclusions }
        candidates.push({
          query: {
            templateId: template.id as PlannedQuery['templateId'],
            goal: template.goal,
            priority: template.priority,
            crossGoal: template.goal !== spec.goal,
            q: join(parts.scope, parts.signal, parts.content, parts.keywords, parts.exclusions),
            engine,
            type: template.result_type,
            ...(country ? { country } : {}),
            ...(location ? { location } : {}),
            ...(language ? { language } : {}),
            ...(time ? { time } : {}),
            pages: pagesPerQuery(spec.depth.per_query),
            scope,
            excludedHosts,
            signal,
          },
          parts,
          soft,
          platformSites,
          order,
        })
      }
    }
  }
  return candidates.length ? { candidates } : { drop: 'produced no queries' }
}

/** Removes every Soft filter from a primary query (fallback / outside batches). */
const widen = (c: Candidate): Omit<PlannedQuery, 'key' | 'batch'> => {
  const { country, location, language, time, ...rest } = c.query
  const keep = <T>(filter: WidenableFilter, value: T | undefined) =>
    value !== undefined && !c.soft.includes(filter) ? value : undefined
  const scopeWidened = c.soft.includes('scope')
  const kept = {
    country: keep('country', country),
    location: keep('location', location),
    language: keep('language', language),
    time: keep('time', time),
  }
  return {
    ...rest,
    ...Object.fromEntries(Object.entries(kept).filter(([, v]) => v !== undefined)),
    q: join(
      scopeWidened ? '' : c.parts.scope,
      c.parts.signal,
      c.soft.includes('content') ? '' : c.parts.content,
      c.parts.keywords,
      c.parts.exclusions,
    ),
    scope: scopeWidened ? { kind: 'any' } : c.query.scope,
    widened: c.soft,
  }
}

export interface BuildPlanOptions {
  /**
   * Learned ordering nudges per template (`priorityBoosts`, T-011), subtracted from the
   * library priority when the budget decides what runs. Library priorities never change.
   */
  boosts?: Readonly<Record<string, number>>
}

/**
 * Turns the spec + template selections into a guarded, budgeted plan. Pure: no I/O.
 * Every query in the result has passed `checkQuery`.
 */
export const buildPlan = (
  spec: IntakeSpec,
  selections: readonly Selection[],
  options: BuildPlanOptions = {},
): Plan => {
  const dropped: DroppedTemplate[] = []
  const rejected: RejectedQuery[] = []
  const pool: Candidate[] = []
  const security = isSecurityRun(spec)

  selections.forEach((selection, order) => {
    const { templateId } = selection
    const problems = validateSelection(selection, spec.filters.country.value)
    if (problems.length) {
      dropped.push({ templateId, reason: `invalid selection: ${problems.join('; ')}` })
      return
    }
    const template = getTemplate(templateId)
    if (template.status !== 'approved') {
      dropped.push({ templateId, reason: `template is ${template.status}` })
      return
    }
    if (template.sensitivity === 'security' && !security) {
      dropped.push({ templateId, reason: 'security template needs an authorized security run' })
      return
    }
    const engine = pickEngine(template, spec)
    if (!engine) {
      dropped.push({ templateId, reason: 'no enabled engine supports this template' })
      return
    }
    const result = compileTemplate(spec, template, selection, engine, order)
    if ('drop' in result) {
      dropped.push({ templateId, reason: result.drop })
      return
    }
    for (const c of result.candidates) {
      const violations = checkQuery(c.query.q, {
        scopeDomains: spec.scope.domains,
        platformSites: c.platformSites,
      })
      if (violations.length) rejected.push({ templateId, q: c.query.q, violations })
      else pool.push(c)
    }
  })

  // Budget (F1) with priority order, then cross-goal cap (D-010).
  const budget = DEPTH_BUDGET[spec.depth.level]
  const crossCap = Math.floor(budget * CROSS_GOAL_SHARE)
  const boosts = options.boosts ?? {}
  const rank = (c: Candidate) => c.query.priority - (boosts[c.query.templateId] ?? 0)
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b) || a.order - b.order)
  const kept: Candidate[] = []
  const overBudget = new Map<string, number>()
  let cross = 0
  for (const c of sorted) {
    const isCross = c.query.crossGoal
    if (kept.length >= budget || (isCross && cross >= crossCap)) {
      overBudget.set(c.query.templateId, (overBudget.get(c.query.templateId) ?? 0) + 1)
      continue
    }
    kept.push(c)
    if (isCross) cross++
  }
  for (const [templateId, count] of overBudget) {
    dropped.push({
      templateId: templateId as PlannedQuery['templateId'],
      reason: `${count} quer${count === 1 ? 'y' : 'ies'} over the ${spec.depth.level} budget`,
    })
  }

  // Batches: primary, then outside (F4, ~20% of budget) or conditional fallback (Soft).
  const queries: PlannedQuery[] = []
  const counters = new Map<string, number>()
  const keyFor = (templateId: string) => {
    const n = (counters.get(templateId) ?? 0) + 1
    counters.set(templateId, n)
    return `${templateId}#${n}`
  }
  const outsideSlots = spec.show_outside_scope ? Math.ceil(budget * OUTSIDE_SHARE) : 0
  let outsideUsed = 0
  for (const c of kept) {
    const key = keyFor(c.query.templateId)
    queries.push({ ...c.query, key, batch: 'primary', widened: [] })
    if (c.soft.length === 0) continue
    const batch = outsideUsed < outsideSlots ? 'outside' : 'fallback'
    if (batch === 'outside') outsideUsed++
    queries.push({ ...widen(c), key: `${key}:${batch}`, batch })
  }

  const pages = (b: PlannedQuery['batch']) =>
    queries.filter((q) => q.batch === b).reduce((sum, q) => sum + q.pages, 0)

  const f = spec.filters
  const modeIf = (active: boolean, mode: Strictness): Strictness | 'n/a' => (active ? mode : 'n/a')
  return {
    queries,
    dropped,
    rejected,
    budget,
    requests: pages('primary') + pages('outside'),
    maxFallbackRequests: pages('fallback'),
    strictness: {
      scope: modeIf(spec.scope.domains.length > 0, spec.scope.mode),
      country: modeIf(f.country.value !== null, f.country.mode),
      location: modeIf(f.location.value !== null, f.location.mode),
      language: modeIf(f.language.value.length > 0, f.language.mode),
      time: modeIf(f.time.value !== 'any', f.time.mode),
      content: modeIf(f.content.value.length > 0, f.content.mode),
    },
  }
}
