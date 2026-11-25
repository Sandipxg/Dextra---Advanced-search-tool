import {
  checkResult,
  type Hit,
  runPlan,
  type ScoredResult,
  type SearchFn,
  scoreResults,
  summarizeResults,
} from '@dextra/core'
import type { Db, RunStats } from '@dextra/db'
import type { Logger } from 'pino'

const INSERT_CHUNK = 500

/** Adds this run's per-template counts to template_stat (feedback loop, T-011). */
const recordTemplateStats = async (
  db: Db,
  goal: string,
  hits: readonly Hit[],
  queried: Map<string, { engine: string; count: number }>,
) => {
  for (const [templateId, { engine, count }] of queried) {
    const own = hits.filter((h) => h.query.templateId === templateId)
    const inScope = own.filter(
      (h) => checkResult(h.query, h.result.url, h.result.title).inScope,
    ).length
    const where = { templateId, engine, goal }
    const existing = await db.templateStat.where(where).takeOptional()
    if (existing) {
      await db.templateStat.where(where).increment({ queries: count, results: own.length, inScope })
    } else {
      await db.templateStat.create({ ...where, queries: count, results: own.length, inScope })
    }
  }
}

const toRow = (runId: string, r: ScoredResult, rank: number) => ({
  runId,
  rank,
  key: r.key,
  url: r.url,
  title: r.title,
  snippet: r.snippet,
  date: r.date ?? null,
  source: r.source ?? null,
  group: r.group,
  reasons: r.reasons,
  score: r.score,
  bestPosition: r.bestPosition,
  queryKeys: r.queryKeys,
  templateIds: r.templateIds,
  goal: r.goal,
  signal: r.signal,
})

/**
 * Runs a confirmed plan: searches, scores, stores results and stats. Never throws: a
 * failure marks the run `failed` with a user-facing message and logs the details.
 */
export const executeRun = async (
  deps: { db: Db; search: SearchFn; logger: Logger },
  runId: string,
) => {
  const { db, logger } = deps
  const run = await db.run.find(runId)
  if (run.status !== 'confirmed') return
  await db.run.find(runId).update({ status: 'running', startedAt: new Date() })

  try {
    const out = await runPlan(run.spec, run.plan, { search: deps.search })
    const executed = run.plan.queries.filter((q) => q.batch !== 'fallback' || out.fallbackRan)
    if (executed.length > 0 && out.errors.length === executed.length) {
      throw new Error(`all ${executed.length} searches failed: ${out.errors[0]?.message ?? ''}`)
    }
    const scored = scoreResults(run.spec, out.hits)
    const queried = new Map<string, { engine: string; count: number }>()
    for (const q of executed) {
      const entry = queried.get(q.templateId) ?? { engine: q.engine, count: 0 }
      entry.count++
      queried.set(q.templateId, entry)
    }
    const stats: RunStats = {
      requests: out.requests,
      fallbackRan: out.fallbackRan,
      errors: out.errors,
      ...summarizeResults(scored),
    }

    await db.$transaction(async () => {
      const rows = scored.map((r, i) => toRow(runId, r, i + 1))
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await db.result.insertMany(rows.slice(i, i + INSERT_CHUNK))
      }
      await recordTemplateStats(db, run.spec.goal, out.hits, queried)
      await db.run.find(runId).update({ status: 'done', finishedAt: new Date(), stats })
    })
    logger.info({ runId, ...stats, errors: stats.errors.length }, 'run finished')
  } catch (error) {
    logger.error({ err: error, runId }, 'run failed')
    await db.run.find(runId).update({
      status: 'failed',
      finishedAt: new Date(),
      error: 'The search could not be completed. Try again later.',
    })
  }
}
