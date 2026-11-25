import { baseHost, GOOGLE_WORD_LIMIT, tokenize, wordCount } from '../compiler/tokens'

/** Operators templates and layers may emit on Google (Context.md, operator matrix). */
export const GOOGLE_OPERATORS: ReadonlySet<string> = new Set([
  'site',
  'filetype',
  'intitle',
  'inurl',
])

export interface QueryGuardContext {
  /** B1 domains (normalised, may include `*.`). */
  scopeDomains: readonly string[]
  /** Platform values picked for the template that produced the query (D-007). */
  platformSites: readonly string[]
}

/** Host is a B1 domain or one of its subdomains. */
export const isInScopeHost = (host: string, domains: readonly string[]): boolean => {
  const h = host.toLowerCase()
  return domains.some((d) => {
    const base = baseHost(d)
    return h === base || h.endsWith(`.${base}`)
  })
}

/**
 * Last check on a compiled query string before it can reach a SERP API.
 * Returns violations; empty means the query may run. Works on the final string, so
 * anything a param, var or layer injected is caught here too.
 */
export const checkQuery = (q: string, ctx: QueryGuardContext): string[] => {
  const violations: string[] = []

  if (/\{[a-z_]+\}/.test(q)) violations.push('unfilled placeholder')
  if ((q.match(/"/g)?.length ?? 0) % 2 !== 0) violations.push('unbalanced quotes')
  if (wordCount(q) > GOOGLE_WORD_LIMIT) {
    violations.push(`more than ${GOOGLE_WORD_LIMIT} words`)
  }

  for (const token of tokenize(q)) {
    const bare = token.replace(/^\(+/, '').replace(/\)+$/, '')
    const negated = bare.startsWith('-')
    const match = (negated ? bare.slice(1) : bare).match(/^([a-z]+):(.*)$/i)
    if (!match) continue
    const op = (match[1] ?? '').toLowerCase()
    const value = (match[2] ?? '').replace(/"/g, '').toLowerCase()

    if (!GOOGLE_OPERATORS.has(op)) {
      violations.push(`operator ${op}: is not allowed`)
      continue
    }
    if (op === 'site' && !negated) {
      const allowed = isInScopeHost(value, ctx.scopeDomains) || ctx.platformSites.includes(value)
      if (!allowed) violations.push(`site:${value} is outside the scope list`)
    }
  }
  return violations
}
