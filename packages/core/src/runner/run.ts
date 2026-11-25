import type { Plan, PlannedQuery } from '../compiler/types'
import { checkResult } from '../guardrails/result-guard'
import type { IntakeSpec } from '../schema/intake-spec'
import type { Hit, RunOutput, SearchFn } from './types'
import { normalizeUrl } from './url'

/** Provider page size (D-017). A shorter page means there are no more results. */
export const PAGE_SIZE = 10

export interface RunOptions {
  search: SearchFn
  /** Parallel SERP requests. */
  concurrency?: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

/** Runs tasks with at most `limit` in flight; keeps going when one fails. */
const runLimited = async <T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
) => {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T
      await task(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Executes a plan (D-003, D-017): primary + outside batches first, then the Soft fallback
 * batch only if primary queries found fewer in-scope results than F3. Each query fetches
 * up to `pages` pages and stops early on a short page. A failing query is recorded and
 * skipped; the run continues.
 */
export const runPlan = async (
  spec: IntakeSpec,
  plan: Plan,
  options: RunOptions,
): Promise<RunOutput> => {
  const concurrency = options.concurrency ?? 4
  const hits: Hit[] = []
  const errors: RunOutput['errors'] = []
  let requests = 0
  let done = 0
  const total = plan.queries.length

  const runQuery = async (query: PlannedQuery) => {
    try {
      for (let page = 1; page <= query.pages; page++) {
        if (options.signal?.aborted) return
        requests++
        const results = await options.search(query, page, options.signal)
        for (const result of results) hits.push({ query, page, result })
        if (results.length < PAGE_SIZE) break
      }
    } catch (error) {
      if (options.signal?.aborted) return
      errors.push({
        queryKey: query.key,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      options.onProgress?.(++done, total)
    }
  }

  const first = plan.queries.filter((q) => q.batch !== 'fallback')
  await runLimited(first, concurrency, runQuery)

  const inScope = new Set(
    hits
      .filter((h) => h.query.batch === 'primary')
      .filter((h) => {
        const check = checkResult(h.query, h.result.url, h.result.title)
        return check.inScope && !check.excluded
      })
      .map((h) => normalizeUrl(h.result.url)),
  )
  const fallback = plan.queries.filter((q) => q.batch === 'fallback')
  const fallbackRan = fallback.length > 0 && inScope.size < spec.depth.min_results
  if (fallbackRan) await runLimited(fallback, concurrency, runQuery)
  else done += fallback.length

  return { hits, requests, fallbackRan, errors }
}
