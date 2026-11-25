import { z } from 'zod'
import { EngineSchema, ResultTypeSchema } from '../schema/enums'
import { type Goal, GoalSchema, isSecurityGoal } from '../schema/goal'
import { COUNTRY_CODES } from '../schema/iso-codes'

/** Vars are filled by code from the spec, never by the LLM (D-008). */
export const TemplateVarSchema = z.enum(['domain', 'name', 'keywords'])
export type TemplateVar = z.infer<typeof TemplateVarSchema>

export const ScopeModeSchema = z.enum(['required', 'optional', 'subdomains', 'none', 'platform'])
export type ScopeMode = z.infer<typeof ScopeModeSchema>

/** Each template id starts with its goal's prefix (Template-Library §2). */
export const GOAL_PREFIX: Record<Goal, string> = {
  documents: 'doc_',
  exposed_pages: 'exp_',
  attack_surface: 'as_',
  tech_fingerprinting: 'tech_',
  third_party_mentions: 'tp_',
  company_research: 'co_',
  competitor_research: 'mk_',
  news_mentions: 'nw_',
  general_research: 'gr_',
}

/**
 * Operators templates may not use: positive `site:` (the compiler adds scope), `site:*.`,
 * `ext:` (Google drops scope), `intext:` / `inbody:` (ignored), and dead Google operators.
 * See Context.md "Operator matrix — reviewed".
 */
const FORBIDDEN_OPERATORS: Array<[RegExp, string]> = [
  [/(^|[\s(])site:/i, 'positive site: (scope is added by the compiler)'],
  [/\bext:/i, 'ext: (use filetype:)'],
  [/\b(intext|inbody):/i, 'intext:/inbody: (use a quoted phrase)'],
  [/\b(cache|related|info|link):/i, 'retired Google operator'],
]

/** Param values are pasted into queries, so they can't carry quotes, braces or newlines. */
const ParamValueSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((v) => !/["{}\n\r]/.test(v), 'Param values cannot contain quotes, braces or newlines')

const PLACEHOLDER = /\{([a-z_]+)\}/g
export const placeholdersOf = (query: string): string[] =>
  [...query.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '')

const TemplateBaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+_[a-z0-9_]+$/, 'snake_case with a goal prefix'),
  goal: GoalSchema,
  title: z.string().min(1).max(80),
  query: z.string().max(300),
  params: z.record(z.string().regex(/^[a-z_]+$/), z.array(ParamValueSchema).min(1).max(30)),
  max_pick: z.int().min(0).max(10),
  combine: z.enum(['or', 'split']),
  vars: z.array(TemplateVarSchema),
  scope_mode: ScopeModeSchema,
  engines: z.array(EngineSchema).min(1),
  result_type: ResultTypeSchema,
  signal: z.string().min(1),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sensitivity: z.enum(['normal', 'security']),
  status: z.enum(['draft', 'approved', 'retired']),
  regional: z.record(z.string(), z.array(z.enum(COUNTRY_CODES)).min(1)).optional(),
  notes: z.string().optional(),
  example: z.string().min(1),
})

/** Per-template rules that keep the LLM's job to "pick enums" (D-002, D-007, D-008, D-012). */
const templateRules = (t: z.output<typeof TemplateBaseSchema>, ctx: z.RefinementCtx) => {
  const issue = (path: PropertyKey[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message })

  if (!t.id.startsWith(GOAL_PREFIX[t.goal])) {
    issue(['id'], `id must start with "${GOAL_PREFIX[t.goal]}" for goal ${t.goal}`)
  }

  for (const [pattern, label] of FORBIDDEN_OPERATORS) {
    if (pattern.test(t.query)) issue(['query'], `Forbidden operator: ${label}`)
  }

  const placeholders = new Set(placeholdersOf(t.query))
  const paramKeys = Object.keys(t.params)
  const queryParams = paramKeys.filter((k) => k !== 'platform')

  for (const p of placeholders) {
    if (!queryParams.includes(p) && !(t.vars as string[]).includes(p)) {
      issue(['query'], `{${p}} is neither a param nor a var`)
    }
  }
  for (const k of queryParams) {
    if (!placeholders.has(k)) issue(['params', k], `param ${k} is not used in the query`)
  }
  for (const v of t.vars) {
    if (!placeholders.has(v)) issue(['vars'], `var ${v} is not used in the query`)
  }

  // `platform` is how platform templates get their site: (D-007).
  const hasPlatform = paramKeys.includes('platform')
  if (t.scope_mode === 'platform' && !hasPlatform) {
    issue(['params'], 'scope_mode platform needs a platform param')
  }
  if (t.scope_mode !== 'platform' && hasPlatform) {
    issue(['params', 'platform'], 'platform param only allowed with scope_mode platform')
  }

  if (paramKeys.length === 0 && t.max_pick !== 0) issue(['max_pick'], 'must be 0 without params')
  if (paramKeys.length > 0 && t.max_pick === 0) issue(['max_pick'], 'must be at least 1')

  if (isSecurityGoal(t.goal) && t.sensitivity !== 'security') {
    issue(['sensitivity'], `${t.goal} templates must be security`)
  }
  if (t.sensitivity === 'security' && ['none', 'optional'].includes(t.scope_mode)) {
    issue(['scope_mode'], 'security templates must be tied to the target scope')
  }

  const allValues = new Set(Object.values(t.params).flat())
  for (const key of Object.keys(t.regional ?? {})) {
    if (!allValues.has(key)) issue(['regional', key], `${key} is not a param value`)
  }

  for (const [key, values] of Object.entries(t.params)) {
    if (new Set(values).size !== values.length) issue(['params', key], 'duplicate values')
  }
}

export const TemplateSchema = TemplateBaseSchema.superRefine(templateRules)
export type Template = z.output<typeof TemplateSchema>

/** Library-level rules: unique ids. */
export const TemplateLibrarySchema = z
  .array(TemplateSchema)
  .min(1)
  .superRefine((list, ctx) => {
    const seen = new Set<string>()
    list.forEach((t, i) => {
      if (seen.has(t.id))
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate id ${t.id}` })
      seen.add(t.id)
    })
  })
