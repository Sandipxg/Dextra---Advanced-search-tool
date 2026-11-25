import type { PlannedQuery } from '../compiler/types'

/** One organic result as any SERP provider returns it. */
export interface RawResult {
  url: string
  title: string
  snippet: string
  /** 1-based rank on its page. */
  position: number
  date?: string
  source?: string
}

/** A result plus the query and page that produced it. */
export interface Hit {
  query: PlannedQuery
  page: number
  result: RawResult
}

export type SearchFn = (
  query: PlannedQuery,
  page: number,
  signal?: AbortSignal,
) => Promise<RawResult[]>

export interface RunOutput {
  hits: Hit[]
  /** SERP requests actually made (pages). */
  requests: number
  /** Whether the Soft fallback batch ran (primary in-scope results < F3). */
  fallbackRan: boolean
  errors: Array<{ queryKey: string; message: string }>
}

/** Where a result is shown (D-003, D-016). */
export type ResultGroup = 'main' | 'outside' | 'unverified'

export interface ScoredResult {
  url: string
  /** Dedupe key. */
  key: string
  title: string
  snippet: string
  date?: string
  source?: string
  group: ResultGroup
  /** Why it's outside the main list, shown as labels. Empty for `main`. */
  reasons: string[]
  score: number
  /** Best (lowest) position across every query that returned it. */
  bestPosition: number
  queryKeys: string[]
  templateIds: string[]
  /** Template goal of the best-ranked hit, for the "grouped by goal" view. */
  goal: string
  signal: 'match' | 'miss' | 'unknown'
}
