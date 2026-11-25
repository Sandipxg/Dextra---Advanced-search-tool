import { z } from 'zod'

/** A4 "What is this for?" */
export const UseCaseSchema = z.enum([
  'bug_bounty',
  'authorized_pentest',
  'own_org_audit',
  'academic_research',
  'journalism',
  'business_research',
  'personal',
])
export type UseCase = z.infer<typeof UseCaseSchema>

/** Use cases that need F6 with an engagement/program link. */
export const AUTH_LINK_USE_CASES = [
  'bug_bounty',
  'authorized_pentest',
] as const satisfies readonly UseCase[]
/** Use cases allowed to run security goals (D-012, D-018). */
export const SECURITY_USE_CASES = [
  'bug_bounty',
  'authorized_pentest',
  'own_org_audit',
] as const satisfies readonly UseCase[]

/** Hard / Soft / Open filter strictness (D-003). */
export const StrictnessSchema = z.enum(['hard', 'soft', 'open'])
export type Strictness = z.infer<typeof StrictnessSchema>

/** B2 "Include subdomains?" */
export const SubdomainsSchema = z.enum(['include', 'exclude', 'only'])

/** C4 time range; maps to Google `tbs=qdr:*` (D-015). */
export const TimeRangeSchema = z.enum(['any', 'qdr:d', 'qdr:w', 'qdr:m', 'qdr:y', 'custom'])
export type TimeRange = z.infer<typeof TimeRangeSchema>

/**
 * D5 "Where should those words appear?" — "Page text" is not offered because Google
 * ignores `intext:` (T-001, D-018).
 */
export const WhereSchema = z.enum(['anywhere', 'title', 'url'])

/** E1 engines. Only `google` is enabled in v1 (D-015). */
export const EngineSchema = z.enum(['google', 'bing', 'brave'])
export type Engine = z.infer<typeof EngineSchema>
export const ENABLED_ENGINES = ['google'] as const satisfies readonly Engine[]

/** E2 result types. `videos` / `images` are Google's Videos and Images tabs (D-028). */
export const ResultTypeSchema = z.enum(['web', 'news', 'scholar', 'videos', 'images'])
export type ResultType = z.infer<typeof ResultTypeSchema>

/** E3 outside platforms (D-027). Each maps to template platform values in `PLATFORM_SITES`. */
export const PlatformSchema = z.enum([
  'linkedin',
  'x',
  'facebook',
  'instagram',
  'youtube',
  'tiktok',
  'pinterest',
  'reddit',
  'stackoverflow',
  'quora',
  'hacker_news',
  'medium',
  'substack',
  'dev_to',
  'github',
  'gitlab',
  'bitbucket',
  'public_docs',
  'slideshare_scribd',
  'crunchbase',
  'glassdoor',
  'g2',
  'capterra',
  'trustpilot',
  'product_hunt',
])
export type Platform = z.infer<typeof PlatformSchema>

/** E5 source preference (re-ranking only). */
export const SourcePreferenceSchema = z.enum(['none', 'official_first', 'community_first'])

/** F1 depth → query budget. */
export const DepthSchema = z.enum(['quick', 'standard', 'thorough'])
export type Depth = z.infer<typeof DepthSchema>
export const DEPTH_BUDGET: Record<Depth, number> = { quick: 10, standard: 30, thorough: 80 }

/** F2 results per query; fetched in pages of 10 (D-017). */
export const PerQuerySchema = z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)])
export type PerQuery = z.infer<typeof PerQuerySchema>
export const pagesPerQuery = (perQuery: PerQuery): number => perQuery / 10

/** F5 output formats. */
export const OutputFormatSchema = z.enum(['ranked', 'grouped', 'csv', 'json'])
