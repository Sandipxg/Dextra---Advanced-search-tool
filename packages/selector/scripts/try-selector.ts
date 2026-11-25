/**
 * Live check: runs the selector on a sample spec and compiles the plan.
 * Needs ANTHROPIC_API_KEY in the root .env; without it the rule-based fallback runs.
 * One request to the Claude API per run.
 *
 *   pnpm --filter @dextra/selector try
 */
import { resolve } from 'node:path'
import { buildPlan, IntakeSpecSchema, routeEngines } from '@dextra/core'
import { selectTemplates } from '../src/index'

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
} catch {
  // no .env
}
if (!process.env.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY

const spec = IntakeSpecSchema.parse({
  goal: 'documents',
  description: 'Annual reports and investor presentations published by Infosys',
  scope: { domains: ['infosys.com'], names: ['Infosys'] },
  filters: { country: { value: 'in' }, content: { value: ['pdf', 'presentation'] } },
  avoid: 'job listings and careers pages',
  depth: { level: 'quick' },
})

const result = await selectTemplates(spec)
console.log(`Source: ${result.source}`)
for (const note of result.notes) console.log(`Note: ${note}`)
for (const s of result.selections)
  console.log(`- ${s.templateId} ${JSON.stringify(s.params)} — ${s.reason}`)
console.log('Proposed exclusions:', result.exclusions)
console.log('Engines:', routeEngines(spec, result.extraEngine).notes.join(' | '))

const plan = buildPlan(spec, result.selections)
console.log(
  `\nPlan: ${plan.queries.length} queries, ${plan.requests} requests (+${plan.maxFallbackRequests} if fallbacks run)`,
)
for (const q of plan.queries) console.log(`  [${q.batch}] ${q.q}`)
for (const d of plan.dropped) console.log(`  dropped ${d.templateId}: ${d.reason}`)
