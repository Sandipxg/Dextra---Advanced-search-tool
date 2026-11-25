/**
 * T-001 spike: which search operators does each engine actually honour?
 *
 * Runs one probe query per operator (and per dialect variant) on every engine with a
 * configured key, then checks the returned URLs/titles/snippets against what the operator
 * should enforce. Writes the operator matrix used by the template compiler and a doc table.
 *
 *   pnpm --filter @dextra/serp spike            # dry run: prints planned queries, no API calls
 *   pnpm --filter @dextra/serp spike --yes      # runs them (spends SERP credits)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProviders, type Engine, resolveProvider, type SearchRequest } from '../src/index'
import type { SerpResult } from '../src/types'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const MATRIX_JSON = resolve(ROOT, 'packages/core/src/templates/operator-matrix.json')
const MATRIX_MD = resolve(ROOT, 'docs/Operator-Matrix.md')

/** Neutral, heavily indexed public site with plenty of PDFs. */
const D = 'nasa.gov'

const host = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}
const path = (url: string) => {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return ''
  }
}
const text = (r: SerpResult) => `${r.title} ${r.snippet}`.toLowerCase()
const onDomain = (url: string) => host(url) === D || host(url).endsWith(`.${D}`)

interface Probe {
  operator: string
  /** Query variants; `{op}` patterns let one probe test several dialects. */
  variants: Array<{ syntax: string; q: string }>
  check: (r: SerpResult) => boolean
  overrides?: Partial<SearchRequest>
  /** Probe passes on result count instead of per-result checks. */
  minResults?: number
}

const PROBES: Probe[] = [
  {
    operator: 'site:',
    variants: [{ syntax: 'site:', q: `site:${D} mars` }],
    check: (r) => onDomain(r.url),
  },
  {
    operator: 'site:*. (subdomains)',
    variants: [{ syntax: 'site:*.', q: `site:*.${D} -site:www.${D} mars` }],
    check: (r) => host(r.url).endsWith(`.${D}`) && host(r.url) !== `www.${D}`,
  },
  {
    operator: '-site:',
    variants: [{ syntax: '-site:', q: `mars rover -site:${D}` }],
    check: (r) => !onDomain(r.url),
  },
  {
    operator: 'filetype:',
    variants: [{ syntax: 'filetype:', q: `site:${D} filetype:pdf mars` }],
    check: (r) => path(r.url).endsWith('.pdf'),
  },
  {
    operator: 'ext:',
    variants: [{ syntax: 'ext:', q: `site:${D} ext:pdf mars` }],
    check: (r) => path(r.url).endsWith('.pdf'),
  },
  {
    operator: 'OR (filetypes)',
    variants: [{ syntax: '(a OR b)', q: `site:${D} (filetype:pdf OR filetype:xlsx) mars` }],
    check: (r) => /\.(pdf|xlsx)$/.test(path(r.url)),
  },
  {
    operator: 'intitle:',
    variants: [{ syntax: 'intitle:', q: `site:${D} intitle:artemis` }],
    check: (r) => r.title.toLowerCase().includes('artemis'),
  },
  {
    operator: 'inurl:',
    variants: [{ syntax: 'inurl:', q: `site:${D} inurl:artemis` }],
    check: (r) => r.url.toLowerCase().includes('artemis'),
  },
  {
    operator: 'intext:',
    variants: [
      { syntax: 'intext:', q: `site:${D} intext:"heat shield"` },
      { syntax: 'inbody:', q: `site:${D} inbody:"heat shield"` },
    ],
    // Snippets are short, so this under-counts; treat "partial" as likely supported.
    check: (r) => text(r).includes('heat shield'),
  },
  {
    operator: '"phrase"',
    variants: [{ syntax: '"…"', q: '"sample return mission"' }],
    check: (r) => text(r).includes('sample return'),
  },
  {
    operator: '-term',
    variants: [{ syntax: '-term', q: `site:${D} mars -rover` }],
    check: (r) => !text(r).includes('rover'),
  },
  {
    operator: 'OR (terms)',
    variants: [{ syntax: '(a OR b)', q: `site:${D} (artemis OR gateway)` }],
    check: (r) => text(r).includes('artemis') || text(r).includes('gateway'),
  },
  {
    operator: 'num=20 (param)',
    variants: [{ syntax: 'num', q: 'mars rover' }],
    check: () => true,
    minResults: 15,
  },
]

type Verdict = 'supported' | 'partial' | 'ignored' | 'no_results' | 'error'

interface Cell {
  operator: string
  syntax: string
  engine: Engine
  provider: string
  query: string
  verdict: Verdict
  results: number
  matched: number
  ignoredParams: string[]
  error?: string
}

const verdictFor = (probe: Probe, results: SerpResult[]): { verdict: Verdict; matched: number } => {
  if (results.length === 0) return { verdict: 'no_results', matched: 0 }
  if (probe.minResults !== undefined) {
    return {
      verdict: results.length >= probe.minResults ? 'supported' : 'ignored',
      matched: results.length,
    }
  }
  const matched = results.filter(probe.check).length
  const ratio = matched / results.length
  return { verdict: ratio >= 0.8 ? 'supported' : ratio >= 0.4 ? 'partial' : 'ignored', matched }
}

const main = async () => {
  try {
    process.loadEnvFile(resolve(ROOT, '.env'))
  } catch {
    // no .env — rely on the real environment
  }
  const run = process.argv.includes('--yes')
  const providers = createProviders(process.env)
  const engines = (['google', 'bing', 'brave'] as const).flatMap((engine) => {
    const provider = resolveProvider(providers, engine, 'web')
    return provider ? [{ engine, provider }] : []
  })

  if (engines.length === 0) {
    console.error(
      'No SERP keys configured. Set SERPER_API_KEY, SERPAPI_API_KEY and/or BRAVE_API_KEY in .env.',
    )
    process.exit(1)
  }

  const plan = engines.flatMap(({ engine, provider }) =>
    PROBES.flatMap((probe) => probe.variants.map((v) => ({ engine, provider, probe, v }))),
  )
  console.log(`Engines: ${engines.map((e) => `${e.engine} via ${e.provider.id}`).join(', ')}`)
  console.log(`Planned queries: ${plan.length}`)
  if (!run) {
    for (const { engine, v } of plan) console.log(`  [${engine}] ${v.q}`)
    console.log('\nDry run only. Re-run with --yes to spend credits and write the matrix.')
    return
  }

  const cells: Cell[] = []
  for (const { engine, provider, probe, v } of plan) {
    const req: SearchRequest = { q: v.q, engine, type: 'web', num: 20, page: 1, ...probe.overrides }
    const base = {
      operator: probe.operator,
      syntax: v.syntax,
      engine,
      provider: provider.id,
      query: v.q,
    }
    try {
      const res = await provider.search(req, AbortSignal.timeout(30_000))
      const { verdict, matched } = verdictFor(probe, res.results)
      cells.push({
        ...base,
        verdict,
        results: res.results.length,
        matched,
        ignoredParams: res.ignored,
      })
      console.log(`  ${verdict.padEnd(10)} [${engine}] ${v.q}  (${matched}/${res.results.length})`)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      cells.push({ ...base, verdict: 'error', results: 0, matched: 0, ignoredParams: [], error })
      console.log(`  error      [${engine}] ${v.q}  ${error}`)
    }
  }

  const generatedAt = new Date().toISOString()
  mkdirSync(dirname(MATRIX_JSON), { recursive: true })
  writeFileSync(MATRIX_JSON, `${JSON.stringify({ generatedAt, probeDomain: D, cells }, null, 2)}\n`)

  const cols = engines.map((e) => e.engine)
  const rows = [...new Set(cells.map((c) => `${c.operator}|${c.syntax}`))]
  const md = [
    '# Operator Matrix',
    '',
    `_Generated ${generatedAt} by \`pnpm --filter @dextra/serp spike --yes\` · probe domain \`${D}\` · do not edit by hand_`,
    '',
    'Verdict = share of returned results that obey the operator: supported ≥ 80%, partial 40–80%, ignored < 40%. `intext:` is checked against short snippets, so it under-counts.',
    '',
    `| Operator | Syntax | ${cols.map((c) => `${c} (via ${engines.find((e) => e.engine === c)?.provider.id})`).join(' | ')} |`,
    `| --- | --- | ${cols.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => {
      const [operator, syntax] = row.split('|')
      const cellsFor = cols.map((engine) => {
        const c = cells.find(
          (x) => x.engine === engine && x.operator === operator && x.syntax === syntax,
        )
        return c ? `${c.verdict} (${c.matched}/${c.results})` : '—'
      })
      return `| ${operator} | \`${syntax}\` | ${cellsFor.join(' | ')} |`
    }),
    '',
  ].join('\n')
  writeFileSync(MATRIX_MD, md)
  console.log(`\nWrote ${MATRIX_JSON}\nWrote ${MATRIX_MD}`)
}

await main()
