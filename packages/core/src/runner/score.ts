import { isIntentWord } from '../compiler/tokens'
import type { WidenableFilter } from '../compiler/types'
import { isInScopeHost } from '../guardrails/query-guard'
import { checkResult } from '../guardrails/result-guard'
import { CONTENT_TYPE_EXTENSIONS } from '../schema/content-types'
import { type IntakeSpec, isSecurityRun } from '../schema/intake-spec'
import type { Hit, ResultGroup, ScoredResult } from './types'
import { normalizeUrl } from './url'

/** Labels for the "Outside scope" group (Intake-Form-Spec, strictness model). */
export const OUTSIDE_LABELS: Record<WidenableFilter, string> = {
  scope: 'Outside your domains',
  country: 'Outside your country',
  location: 'Outside your city or region',
  language: 'Outside your language',
  time: 'Outside your time range',
  content: 'Outside your content types',
}
export const ENGINE_IGNORED_SCOPE = 'The search engine ignored your domain filter'
export const UNVERIFIED = 'Not in your scope: unverified, not searched further'
/** Shown on a result that is missing one or more of the required keywords (T-023). */
export const LOOSE_MATCH = 'May not match your keywords'

/** Lowercase, keep alphanumerics, collapse the rest to single spaces (padded for word-ish matching). */
const normalizeText = (text: string): string =>
  ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

const COMMUNITY_HOSTS = [
  'reddit.com',
  'stackoverflow.com',
  'stackexchange.com',
  'quora.com',
  'news.ycombinator.com',
  'github.com',
  'medium.com',
  'dev.to',
]
const OFFICIAL_TLDS = ['gov', 'gov.in', 'nic.in', 'edu', 'ac.in', 'int', 'mil']

const GROUP_ORDER: Record<ResultGroup, number> = { main: 0, outside: 1, unverified: 2 }

interface Entry {
  result: Omit<ScoredResult, 'score'>
  rankPoints: number
  bestSignal: 'match' | 'miss' | 'unknown'
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Turns raw hits into deduplicated, grouped, ranked results (T-010).
 *
 * Groups: `main` = matched every filter; `outside` = found only by a widened query (or
 * the engine ignored scope on a Soft run), labelled with what was widened; `unverified` =
 * security runs only, hosts outside the target scope (listed, never searched further).
 * Hard-scope runs drop out-of-scope results. B3/E4 hosts and B6 known URLs are removed.
 *
 * Score = 10 per distinct query that found it + 10/position per hit + signal (+5 match,
 * -5 miss) + Open-filter and source-preference bonuses.
 */
export const scoreResults = (spec: IntakeSpec, hits: readonly Hit[]): ScoredResult[] => {
  const security = isSecurityRun(spec)
  const known = new Set(spec.scope.known_urls.map(normalizeUrl))
  const domains = spec.scope.domains
  const entries = new Map<string, Entry>()

  for (const { query, page, result } of hits) {
    const key = normalizeUrl(result.url)
    if (!key || known.has(key)) continue
    const check = checkResult(query, result.url, result.title)
    if (check.excluded) continue
    const host = hostOf(result.url)

    let group: ResultGroup
    let reasons: string[]
    if (query.batch === 'primary') {
      if (check.inScope) {
        group = 'main'
        reasons = []
      } else if (security) {
        group = 'unverified'
        reasons = [UNVERIFIED]
      } else if (spec.scope.mode === 'hard') {
        continue
      } else {
        group = 'outside'
        reasons = [ENGINE_IGNORED_SCOPE]
      }
    } else {
      const widened = query.widened.filter(
        (f) => !(f === 'scope' && domains.length > 0 && isInScopeHost(host, domains)),
      )
      group = widened.length ? 'outside' : 'main'
      reasons = widened.map((f) => OUTSIDE_LABELS[f])
    }

    const position = (page - 1) * 10 + result.position
    const existing = entries.get(key)
    if (!existing) {
      entries.set(key, {
        result: {
          url: result.url,
          key,
          title: result.title,
          snippet: result.snippet,
          ...(result.date ? { date: result.date } : {}),
          ...(result.source ? { source: result.source } : {}),
          group,
          reasons,
          bestPosition: position,
          queryKeys: [query.key],
          templateIds: [query.templateId],
          goal: query.goal,
          signal: check.signal,
        },
        rankPoints: 10 / position,
        bestSignal: check.signal,
      })
      continue
    }

    const r = existing.result
    existing.rankPoints += 10 / position
    if (!r.queryKeys.includes(query.key)) r.queryKeys.push(query.key)
    if (!r.templateIds.includes(query.templateId)) r.templateIds.push(query.templateId)
    // Best group wins; within the same group, the shortest list of reasons.
    if (
      GROUP_ORDER[group] < GROUP_ORDER[r.group] ||
      (group === r.group && reasons.length < r.reasons.length)
    ) {
      r.group = group
      r.reasons = reasons
    }
    if (position < r.bestPosition) {
      r.bestPosition = position
      r.url = result.url
      r.title = result.title
      r.snippet = result.snippet
      r.goal = query.goal
    }
    if (
      check.signal === 'match' ||
      (check.signal === 'miss' && existing.bestSignal === 'unknown')
    ) {
      existing.bestSignal = check.signal
    }
    r.signal = existing.bestSignal
  }

  const anyTerms = spec.keywords.any.map((t) => t.toLowerCase())
  // Required keywords (D2/D4), minus intent words: every result is expected to contain them.
  const requiredTerms = [
    ...spec.keywords.all.filter((t) => !isIntentWord(t)),
    ...spec.keywords.phrases,
  ]
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
  const openExts =
    spec.filters.content.mode === 'open'
      ? new Set(spec.filters.content.value.flatMap((c) => CONTENT_TYPE_EXTENSIONS[c]))
      : new Set<string>()

  const bonus = (r: Omit<ScoredResult, 'score'>): number => {
    const host = hostOf(r.url)
    const text = `${r.title} ${r.snippet}`.toLowerCase()
    let b = Math.min(6, 2 * anyTerms.filter((t) => text.includes(t)).length)
    const ext = r.url.toLowerCase().match(/\.([a-z0-9]{1,5})(?:[?#]|$)/)?.[1]
    if (ext && openExts.has(ext)) b += 3
    if (spec.scope.mode === 'open' && domains.length && isInScopeHost(host, domains)) b += 4
    if (spec.sources.preference === 'official_first') {
      const official =
        (domains.length > 0 && isInScopeHost(host, domains)) ||
        OFFICIAL_TLDS.some((tld) => host.endsWith(`.${tld}`))
      if (official) b += 4
    }
    if (spec.sources.preference === 'community_first' && isInScopeHost(host, COMMUNITY_HOSTS))
      b += 4
    return b
  }

  // Relevance by keyword coverage (T-023): reward each required keyword present in the
  // title/snippet/URL and demote results that miss one, so an off-topic page the dork
  // mechanically matched sinks below a relevant one. A result missing any required keyword
  // is flagged for the reader.
  const keywordScore = (r: Omit<ScoredResult, 'score'>): number => {
    if (!requiredTerms.length) return 0
    const hay = normalizeText(`${r.title} ${r.snippet} ${r.url}`)
    const missing = requiredTerms.filter((t) => !hay.includes(` ${t} `))
    if (missing.length && !r.reasons.includes(LOOSE_MATCH)) r.reasons = [...r.reasons, LOOSE_MATCH]
    return 4 * (requiredTerms.length - missing.length) - 16 * missing.length
  }

  const scored = [...entries.values()].map(({ result, rankPoints }) => {
    const signalPoints = result.signal === 'match' ? 5 : result.signal === 'miss' ? -5 : 0
    const score =
      10 * result.queryKeys.length +
      rankPoints +
      signalPoints +
      bonus(result) +
      keywordScore(result)
    return { ...result, score: Math.round(score * 10) / 10 }
  })

  return scored.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      b.score - a.score ||
      a.bestPosition - b.bestPosition,
  )
}
