/**
 * End-to-end check without a database: spec -> selector -> plan -> live SERP searches ->
 * scored report. Uses the SERP keys in .env (and ANTHROPIC_API_KEY if set).
 *
 *   pnpm --filter @dextra/api try-run          # dry run: shows the plan and request count
 *   pnpm --filter @dextra/api try-run --yes    # runs the searches (spends SERP credits)
 */
import { resolve } from 'node:path'
import { buildPlan, IntakeSpecSchema, runPlan, scoreResults, summarizeResults } from '@dextra/core'
import { selectTemplates } from '@dextra/selector'
import { createProviders } from '@dextra/serp'
import { createSearch } from '../src/search'

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
} catch {
  // no .env
}
for (const k of ['ANTHROPIC_API_KEY', 'SERPER_API_KEY', 'SERPAPI_API_KEY', 'BRAVE_API_KEY']) {
  if (!process.env[k]) delete process.env[k]
}

const spec = IntakeSpecSchema.parse({
  goal: 'documents',
  description: 'Annual reports and investor presentations published by Infosys',
  scope: { domains: ['infosys.com'], names: ['Infosys'] },
  filters: { content: { value: ['pdf'] } },
  depth: { level: 'quick', per_query: 10, min_results: 5 },
})

const selection = await selectTemplates(spec)
const plan = buildPlan(spec, selection.selections)
console.log(
  `Selector: ${selection.source}${selection.notes.length ? ` (${selection.notes.join(' ')})` : ''}`,
)
console.log(
  `Plan: ${plan.queries.length} queries, ${plan.requests} requests now, up to ${plan.maxFallbackRequests} more if fallbacks run`,
)
for (const q of plan.queries) console.log(`  [${q.batch}] ${q.q}`)

if (!process.argv.includes('--yes')) {
  console.log('\nDry run. Re-run with --yes to search.')
  process.exit(0)
}

const providers = createProviders(process.env)
if (providers.length === 0) throw new Error('No SERP key in .env')
const out = await runPlan(spec, plan, { search: createSearch(providers) })
const results = scoreResults(spec, out.hits)
console.log(
  `\n${out.requests} requests, fallback ran: ${out.fallbackRan}, errors: ${out.errors.length}`,
)
console.log(summarizeResults(results))
for (const r of results.slice(0, 15)) {
  console.log(
    `${String(r.score).padStart(5)}  ${r.group.padEnd(10)} ${r.url}${r.reasons.length ? `  (${r.reasons.join('; ')})` : ''}`,
  )
}
