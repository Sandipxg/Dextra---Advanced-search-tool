/**
 * Template review report (T-011, T-012): per-template evidence from ratings and scope
 * rates, suggestions for whoever edits docs/Template-Library.md, and the outside-scope
 * verdict. Reads the database only; changes nothing.
 *
 *   pnpm --filter @dextra/api template-report            # prints Markdown
 *   pnpm --filter @dextra/api template-report --write    # also writes docs/Template-Stats.md
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  type GroupRatings,
  MIN_RESULTS_FOR_SCOPE,
  MIN_VOTES,
  outsideScopeVerdict,
  reviewSuggestions,
  summarizeStats,
} from '@dextra/core'
import { createDb } from '@dextra/db'

const ROOT = resolve(import.meta.dirname, '../../..')
try {
  process.loadEnvFile(resolve(ROOT, '.env'))
} catch {
  // no .env
}
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is missing (set it in .env)')

const db = createDb(url)
try {
  const rows = await db.templateStat.select(
    'templateId',
    'engine',
    'goal',
    'queries',
    'results',
    'inScope',
    'useful',
    'notUseful',
  )
  const rated = await db.result.select('group', 'feedback').where({ feedback: { not: null } })
  const ratings: GroupRatings = {
    main: { useful: 0, notUseful: 0 },
    outside: { useful: 0, notUseful: 0 },
  }
  for (const r of rated) {
    const g = r.group === 'main' ? ratings.main : r.group === 'outside' ? ratings.outside : null
    if (!g) continue
    if (r.feedback === 'useful') g.useful++
    else g.notUseful++
  }

  const records = summarizeStats(rows).sort((a, b) => a.templateId.localeCompare(b.templateId))
  const suggestions = reviewSuggestions(records)
  const verdict = outsideScopeVerdict(ratings)
  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)

  const md = [
    '# Template Stats',
    '',
    `_Generated ${new Date().toISOString()} by \`pnpm --filter @dextra/api template-report --write\` · do not edit by hand_`,
    '',
    `Ratings count once there are ${MIN_VOTES}+; scope rates once there are ${MIN_RESULTS_FOR_SCOPE}+ results. Library changes stay manual (D-002).`,
    '',
    '## Templates',
    '',
    '| Template | Queries | Results | In scope | Ratings | Rated useful |',
    '| --- | --- | --- | --- | --- | --- |',
    ...records.map(
      (r) =>
        `| ${r.templateId} | ${r.queries} | ${r.results} | ${pct(r.scopeRate)} | ${r.votes} | ${r.votes ? pct(r.usefulRate) : '—'} |`,
    ),
    '',
    '## Suggestions for review',
    '',
    ...(suggestions.length
      ? suggestions.map((s) => `- **${s.templateId}** — ${s.message}`)
      : ['_Not enough evidence yet._']),
    '',
    '## Outside-scope batch (T-012)',
    '',
    `- ${verdict.detail}`,
    `- Verdict: **${verdict.decision === 'undecided' ? 'undecided (not enough outside-scope ratings yet)' : verdict.decision === 'keep_fixed' ? 'keep the fixed ~20% batch' : 'run widened queries only when results fall short'}**`,
    '',
  ].join('\n')

  console.log(md)
  if (process.argv.includes('--write')) {
    writeFileSync(resolve(ROOT, 'docs/Template-Stats.md'), md)
    console.log('Wrote docs/Template-Stats.md')
  }
} finally {
  await db.$close()
}
