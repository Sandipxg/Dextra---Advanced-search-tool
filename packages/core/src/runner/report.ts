import type { ScoredResult } from './types'

const CSV_COLUMNS = [
  'rank',
  'group',
  'score',
  'title',
  'url',
  'snippet',
  'reasons',
  'templates',
  'date',
  'source',
] as const

/**
 * Quotes a CSV cell. Cells starting with `= + - @` (or tab/CR) get a leading `'` so
 * spreadsheet apps don't run them as formulas (CSV injection), since titles and snippets
 * come from arbitrary web pages.
 */
export const csvCell = (value: string | number): string => {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** F5 "CSV": one row per result, main group first. */
export const toCsv = (results: readonly ScoredResult[]): string => {
  const rows = results.map((r, i) =>
    [
      i + 1,
      r.group,
      r.score,
      r.title,
      r.url,
      r.snippet,
      r.reasons.join('; '),
      r.templateIds.join(' '),
      r.date ?? '',
      r.source ?? '',
    ]
      .map(csvCell)
      .join(','),
  )
  return `${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}\r\n`
}

/** F5 "Grouped by goal": main results bucketed by the goal of their best template. */
export const groupByGoal = (results: readonly ScoredResult[]): Record<string, ScoredResult[]> => {
  const groups: Record<string, ScoredResult[]> = {}
  for (const r of results) {
    if (r.group !== 'main') continue
    const bucket = groups[r.goal] ?? []
    bucket.push(r)
    groups[r.goal] = bucket
  }
  return groups
}

/** Counts for the report header. */
export const summarizeResults = (results: readonly ScoredResult[]) => ({
  main: results.filter((r) => r.group === 'main').length,
  outside: results.filter((r) => r.group === 'outside').length,
  unverified: results.filter((r) => r.group === 'unverified').length,
})
