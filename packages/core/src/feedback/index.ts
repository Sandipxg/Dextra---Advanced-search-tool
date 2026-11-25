/**
 * Feedback loop (T-011): turns per-template counts into evidence the planner can use.
 * Library priorities never change automatically (D-002); learned evidence only nudges the
 * order within a plan and is shown to the selector and to humans reviewing the library.
 */

export type Feedback = 'useful' | 'not_useful'

/** One `template_stat` row. */
export interface TemplateStatRow {
  templateId: string
  engine: string
  goal: string
  queries: number
  results: number
  inScope: number
  useful: number
  notUseful: number
}

export interface TemplateRecord {
  templateId: string
  queries: number
  results: number
  /** useful + not useful ratings. */
  votes: number
  /** Laplace-smoothed share of useful ratings: (useful + 1) / (votes + 2). */
  usefulRate: number
  /** Share of returned results inside scope; null before any results. */
  scopeRate: number | null
}

/** Below this many ratings, usefulness is not trusted. */
export const MIN_VOTES = 5
/** Below this many results, the scope-held rate is not trusted. */
export const MIN_RESULTS_FOR_SCOPE = 20

/** Adds up rows per template (across engines) for one goal or all goals. */
export const summarizeStats = (rows: readonly TemplateStatRow[]): TemplateRecord[] => {
  const byTemplate = new Map<
    string,
    Omit<TemplateRecord, 'usefulRate' | 'scopeRate' | 'votes'> & {
      inScope: number
      useful: number
      notUseful: number
    }
  >()
  for (const r of rows) {
    const acc = byTemplate.get(r.templateId) ?? {
      templateId: r.templateId,
      queries: 0,
      results: 0,
      inScope: 0,
      useful: 0,
      notUseful: 0,
    }
    acc.queries += r.queries
    acc.results += r.results
    acc.inScope += r.inScope
    acc.useful += r.useful
    acc.notUseful += r.notUseful
    byTemplate.set(r.templateId, acc)
  }
  return [...byTemplate.values()].map((a) => {
    const votes = a.useful + a.notUseful
    return {
      templateId: a.templateId,
      queries: a.queries,
      results: a.results,
      votes,
      usefulRate: (a.useful + 1) / (votes + 2),
      scopeRate: a.results > 0 ? a.inScope / a.results : null,
    }
  })
}

/**
 * Small ordering nudges for `buildPlan` (subtracted from library priority 1–3), only with
 * enough evidence: well-rated templates move up half a step; poorly rated ones, or ones
 * whose results the engine keeps returning off-scope, move down. Range -1 … +0.5.
 */
export const priorityBoosts = (records: readonly TemplateRecord[]): Record<string, number> => {
  const boosts: Record<string, number> = {}
  for (const r of records) {
    let boost = 0
    if (r.votes >= MIN_VOTES) {
      if (r.usefulRate >= 0.7) boost += 0.5
      else if (r.usefulRate <= 0.3) boost -= 0.5
    }
    if (r.results >= MIN_RESULTS_FOR_SCOPE && r.scopeRate !== null && r.scopeRate < 0.5)
      boost -= 0.5
    if (boost !== 0) boosts[r.templateId] = Math.max(-1, Math.min(0.5, boost))
  }
  return boosts
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Track record lines for the selector prompt; only templates with enough evidence. */
export const formatTrackRecord = (records: readonly TemplateRecord[]): string =>
  records
    .filter((r) => r.votes >= MIN_VOTES || r.results >= MIN_RESULTS_FOR_SCOPE)
    .sort((a, b) => a.templateId.localeCompare(b.templateId))
    .map((r) => {
      const parts = [
        r.votes >= MIN_VOTES ? `${pct(r.usefulRate)} rated useful (${r.votes} ratings)` : '',
        r.results >= MIN_RESULTS_FOR_SCOPE && r.scopeRate !== null
          ? `${pct(r.scopeRate)} of results in scope`
          : '',
      ].filter(Boolean)
      return `- ${r.templateId}: ${parts.join(', ')}`
    })
    .join('\n')

/** Counter changes when a result's rating goes from `previous` to `next`. */
export const feedbackDelta = (
  previous: Feedback | null,
  next: Feedback | null,
): { useful: number; notUseful: number } => ({
  useful: (next === 'useful' ? 1 : 0) - (previous === 'useful' ? 1 : 0),
  notUseful: (next === 'not_useful' ? 1 : 0) - (previous === 'not_useful' ? 1 : 0),
})

export interface ReviewSuggestion {
  templateId: string
  kind: 'retire_or_rework' | 'tighten_scope' | 'too_narrow' | 'promote'
  message: string
}

/**
 * Suggestions for a person reviewing docs/Template-Library.md (D-002: never applied
 * automatically). Only made with enough evidence.
 */
export const reviewSuggestions = (records: readonly TemplateRecord[]): ReviewSuggestion[] =>
  records.flatMap((r) => {
    const out: ReviewSuggestion[] = []
    if (r.votes >= MIN_VOTES && r.usefulRate <= 0.3) {
      out.push({
        templateId: r.templateId,
        kind: 'retire_or_rework',
        message: `Rarely useful (${pct(r.usefulRate)} of ${r.votes} ratings): rework its signal or set status: retired.`,
      })
    }
    if (r.votes >= MIN_VOTES && r.usefulRate >= 0.8) {
      out.push({
        templateId: r.templateId,
        kind: 'promote',
        message: `Rated useful ${pct(r.usefulRate)} of the time (${r.votes} ratings): consider a higher library priority.`,
      })
    }
    if (r.results >= MIN_RESULTS_FOR_SCOPE && r.scopeRate !== null && r.scopeRate < 0.5) {
      out.push({
        templateId: r.templateId,
        kind: 'tighten_scope',
        message: `Only ${pct(r.scopeRate)} of ${r.results} results were in scope: the engine relaxes this query; tighten the signal.`,
      })
    }
    if (r.queries >= 10 && r.results / r.queries < 2) {
      out.push({
        templateId: r.templateId,
        kind: 'too_narrow',
        message: `${(r.results / r.queries).toFixed(1)} results per query over ${r.queries} queries: values may be too narrow.`,
      })
    }
    return out
  })

/** Ratings per result group, for T-012. */
export interface GroupRatings {
  main: { useful: number; notUseful: number }
  outside: { useful: number; notUseful: number }
}

/** Below this many outside-scope ratings, T-012 stays undecided. */
export const MIN_OUTSIDE_RATINGS = 20

/**
 * T-012: is the fixed ~20% outside-scope batch worth its searches? Keep it when outside
 * results are rated useful at least half as often as main results; otherwise run widened
 * queries only when results fall short.
 */
export const outsideScopeVerdict = (
  ratings: GroupRatings,
): { decision: 'keep_fixed' | 'only_on_shortfall' | 'undecided'; detail: string } => {
  const rate = (g: { useful: number; notUseful: number }) =>
    g.useful + g.notUseful === 0 ? 0 : g.useful / (g.useful + g.notUseful)
  const outsideVotes = ratings.outside.useful + ratings.outside.notUseful
  const mainRate = rate(ratings.main)
  const outsideRate = rate(ratings.outside)
  const detail = `main ${pct(mainRate)} useful (${ratings.main.useful + ratings.main.notUseful} ratings), outside scope ${pct(outsideRate)} useful (${outsideVotes} ratings)`
  if (outsideVotes < MIN_OUTSIDE_RATINGS) return { decision: 'undecided', detail }
  return { decision: outsideRate >= mainRate / 2 ? 'keep_fixed' : 'only_on_shortfall', detail }
}
