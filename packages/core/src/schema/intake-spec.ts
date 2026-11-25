import { z } from 'zod'
import { ContentTypeSchema } from './content-types'
import {
  AUTH_LINK_USE_CASES,
  DepthSchema,
  ENABLED_ENGINES,
  EngineSchema,
  OutputFormatSchema,
  PerQuerySchema,
  PlatformSchema,
  ResultTypeSchema,
  SECURITY_USE_CASES,
  SourcePreferenceSchema,
  StrictnessSchema,
  SubdomainsSchema,
  TimeRangeSchema,
  type UseCase,
  UseCaseSchema,
  WhereSchema,
} from './enums'
import {
  DomainSchema,
  HttpUrlSchema,
  IsoDateSchema,
  TagSchema,
  textField,
  uniqueList,
} from './fields'
import { GoalSchema, isSecurityGoal } from './goal'
import { COUNTRY_CODES, LANGUAGE_CODES } from './iso-codes'

/**
 * The intake spec (Intake-Form-Spec.md). One schema validates the form, the API and
 * anything the LLM step echoes back (D-005). Field comments give the form field ID.
 *
 * Every field except A1/A2 has a default, so a basic-mode form (8 fields) parses into a
 * complete spec (D-006). Defaults use `.prefault()` so they run through validation too.
 */

const soft = StrictnessSchema.default('soft')

const ScopeSchema = z.object({
  /** B1 */ domains: uniqueList(DomainSchema, 50).default([]),
  /** B2 */ subdomains: SubdomainsSchema.default('include'),
  /** B3 */ exclude_domains: uniqueList(DomainSchema, 100).default([]),
  /** B4 */ names: uniqueList(TagSchema, 20).default([]),
  /** B5 — forced to `hard` for security runs */ mode: soft,
  /** B6 */ known_urls: z.array(HttpUrlSchema).max(1000).default([]),
})

const FiltersSchema = z.object({
  /** C1 — null = any country */
  country: z
    .object({ value: z.enum(COUNTRY_CODES).nullable().default(null), mode: soft })
    .prefault({}),
  /** C2 — canonical SERP location name, needs C1 */
  location: z
    .object({ value: textField(200).pipe(z.string().min(1)).nullable().default(null), mode: soft })
    .prefault({}),
  /** C3 — empty = any language */
  language: z
    .object({ value: uniqueList(z.enum(LANGUAGE_CODES), 10).default([]), mode: soft })
    .prefault({}),
  /** C4 + C5 */
  time: z
    .object({
      value: TimeRangeSchema.default('any'),
      custom: z.object({ from: IsoDateSchema, to: IsoDateSchema }).nullable().default(null),
      mode: soft,
    })
    .prefault({}),
  /** D1 — empty = any content */
  content: z
    .object({
      value: uniqueList(ContentTypeSchema, ContentTypeSchema.options.length).default([]),
      mode: soft,
    })
    .prefault({}),
})

const KeywordsSchema = z.object({
  /** D2 must appear (Hard) */ all: uniqueList(TagSchema, 20).default([]),
  /** D3 any one is enough (Open) */ any: uniqueList(TagSchema, 20).default([]),
  /** D4 exact phrases (Hard) */ phrases: uniqueList(TagSchema, 10).default([]),
  /** D5 */ where: WhereSchema.default('anywhere'),
  /** From A5, confirmed by the user before the run */ exclude: uniqueList(TagSchema, 30).default(
    [],
  ),
})

const SourcesSchema = z.object({
  /** E1 — `auto` lets the engine router decide (D-004) */
  engines: z
    .union([z.literal('auto'), uniqueList(EngineSchema, 3).pipe(z.array(EngineSchema).min(1))])
    .default('auto'),
  /** E2 */ types: uniqueList(ResultTypeSchema, 3)
    .pipe(z.array(ResultTypeSchema).min(1))
    .default(['web']),
  /** E3 */ platforms: z
    .object({
      value: uniqueList(PlatformSchema, PlatformSchema.options.length).default([]),
      mode: soft,
    })
    .prefault({}),
  /** E4 */ never: uniqueList(DomainSchema, 100).default([]),
  /** E5 */ preference: SourcePreferenceSchema.default('none'),
})

const DepthBlockSchema = z.object({
  /** F1 */ level: DepthSchema.default('standard'),
  /** F2 */ per_query: PerQuerySchema.default(20),
  /** F3 */ min_results: z.int().min(1).max(500).default(15),
})

/** F6 — the user confirms they are authorized; link required for bug bounty / pentest. */
const AuthorizationSchema = z.object({
  confirmed: z.literal(true, { error: 'You must confirm you are authorized' }),
  link: HttpUrlSchema.nullable().default(null),
})

const BaseSpecSchema = z.object({
  /** A1 */ goal: GoalSchema,
  /** A2 — optional context; keywords drive the search (D-026) */ description:
    textField(300).default(''),
  /** A3 */ perfect_result: z
    .object({
      text: textField(500).default(''),
      example_urls: z.array(HttpUrlSchema).max(3).default([]),
    })
    .prefault({}),
  /** A4 */ use_case: UseCaseSchema.nullable().default(null),
  /** A5 raw text; the LLM turns it into keywords.exclude / scope.exclude_domains */
  avoid: textField(300).default(''),
  scope: ScopeSchema.prefault({}),
  filters: FiltersSchema.prefault({}),
  keywords: KeywordsSchema.prefault({}),
  sources: SourcesSchema.prefault({}),
  depth: DepthBlockSchema.prefault({}),
  /** F4 */ show_outside_scope: z.boolean().default(false),
  /** F5 */ output: uniqueList(OutputFormatSchema, 4)
    .pipe(z.array(OutputFormatSchema).min(1))
    .default(['ranked']),
  /** F6 */ authorization: AuthorizationSchema.nullable().default(null),
  /** F7 */ notes: textField(1000).default(''),
})

type BaseSpec = z.output<typeof BaseSpecSchema>

const includes = <T extends string>(list: readonly T[], value: string | null): value is T =>
  value !== null && (list as readonly string[]).includes(value)

/** Security run = security goal, or a bug bounty / pentest use case. Forces Hard scope + F6. */
export const isSecurityRun = (spec: Pick<BaseSpec, 'goal' | 'use_case'>): boolean =>
  isSecurityGoal(spec.goal) || includes(AUTH_LINK_USE_CASES, spec.use_case)

/** "General topic with no keywords" → the selector asks one follow-up question. */
export const needsKeywordFollowUp = (spec: Pick<BaseSpec, 'goal' | 'keywords'>): boolean =>
  spec.goal === 'general_research' &&
  spec.keywords.all.length === 0 &&
  spec.keywords.phrases.length === 0

const crossFieldRules = (spec: BaseSpec, ctx: z.RefinementCtx) => {
  const issue = (path: PropertyKey[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message })

  // A4: security goals only for security use cases (D-018).
  if (isSecurityGoal(spec.goal) && !includes(SECURITY_USE_CASES, spec.use_case)) {
    issue(
      ['use_case'],
      'Security goals need a use case: bug bounty, authorized pentest or own org audit',
    )
  }

  if (isSecurityRun(spec)) {
    if (spec.scope.domains.length === 0) {
      issue(['scope', 'domains'], 'Target domains are required for security work')
    }
    if (!spec.authorization) {
      issue(['authorization'], 'Confirm you are authorized to test these domains')
    } else if (includes(AUTH_LINK_USE_CASES, spec.use_case) && !spec.authorization.link) {
      issue(['authorization', 'link'], 'Add the program or engagement link')
    }
  }

  // B3 / E4 must not overlap B1.
  const targets = new Set(spec.scope.domains)
  spec.scope.exclude_domains.forEach((d, i) => {
    if (targets.has(d)) issue(['scope', 'exclude_domains', i], `${d} is also a target domain`)
  })
  spec.sources.never.forEach((d, i) => {
    if (targets.has(d)) issue(['sources', 'never', i], `${d} is also a target domain`)
  })

  // C2 needs C1.
  if (spec.filters.location.value && !spec.filters.country.value) {
    issue(['filters', 'location', 'value'], 'Pick a country before a city or region')
  }

  // C4 / C5.
  const { value, custom } = spec.filters.time
  if (value === 'custom' && !custom) {
    issue(['filters', 'time', 'custom'], 'Pick a start and end date')
  }
  if (value !== 'custom' && custom) {
    issue(['filters', 'time', 'custom'], 'Custom dates only apply when the time range is Custom')
  }
  if (custom && custom.from > custom.to) {
    issue(['filters', 'time', 'custom', 'to'], 'End date must be on or after the start date')
  }

  // E1: only enabled engines (D-015).
  if (spec.sources.engines !== 'auto') {
    spec.sources.engines.forEach((engine, i) => {
      if (!(ENABLED_ENGINES as readonly string[]).includes(engine)) {
        issue(['sources', 'engines', i], `${engine} is not available yet`)
      }
    })
  }
}

// B5 is locked to Hard for security runs (D-003).
const lockSecurityScope = (spec: BaseSpec): BaseSpec =>
  isSecurityRun(spec) ? { ...spec, scope: { ...spec.scope, mode: 'hard' as const } } : spec

export const IntakeSpecSchema =
  BaseSpecSchema.superRefine(crossFieldRules).transform(lockSecurityScope)

/** Keywords drive the search (D-026); security goals search by domain + signal instead. */
const hasKeywordsOrSecurityGoal = (spec: unknown): boolean => {
  // Runs even when other fields are invalid (`when` below), so read defensively.
  const value = spec as { goal?: unknown; keywords?: { all?: unknown[]; phrases?: unknown[] } }
  const goal = GoalSchema.safeParse(value?.goal)
  if (goal.success && isSecurityGoal(goal.data)) return true
  return (value?.keywords?.all?.length ?? 0) + (value?.keywords?.phrases?.length ?? 0) > 0
}

/**
 * What a person submits through the search form (web form and POST /api/plans): the
 * intake spec plus "at least one keyword" for non-security goals (D-026). Specs built in
 * code (tests, fallbacks) use `IntakeSpecSchema`.
 */
export const IntakeFormSchema = BaseSpecSchema.refine(hasKeywordsOrSecurityGoal, {
  path: ['keywords', 'all'],
  message: 'Add at least one keyword',
  // Report it together with other errors, not only after they are fixed.
  when: () => true,
})
  .superRefine(crossFieldRules)
  .transform(lockSecurityScope)

/** What the form/API sends (most fields optional). */
export type IntakeSpecInput = z.input<typeof IntakeSpecSchema>
/** Fully defaulted, validated spec — the only thing the template selector sees. */
export type IntakeSpec = z.output<typeof IntakeSpecSchema>
export type { UseCase }
