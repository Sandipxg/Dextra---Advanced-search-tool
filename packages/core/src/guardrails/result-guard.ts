import { baseHost } from '../compiler/tokens'
import type { PlannedQuery, ResultScope } from '../compiler/types'

export interface ResultCheck {
  /** Result host fits the query's scope. */
  inScope: boolean
  /** Result host is on B3 / E4 (never show). */
  excluded: boolean
  /** Whether the result looks like the template's signal; `unknown` when not checkable. */
  signal: 'match' | 'miss' | 'unknown'
}

const parse = (url: string): URL | null => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

const hostMatches = (host: string, domain: string) => {
  const base = baseHost(domain)
  return host === base || host.endsWith(`.${base}`)
}

const inScope = (url: URL, scope: ResultScope): boolean => {
  const host = url.hostname.toLowerCase()
  switch (scope.kind) {
    case 'any':
      return true
    case 'domains':
      return scope.domains.some((d) => {
        const base = baseHost(d)
        if (!hostMatches(host, base)) return false
        const isMain = host === base || host === `www.${base}`
        if (scope.subdomains === 'exclude') return isMain
        if (scope.subdomains === 'only' || d.startsWith('*.')) return !isMain
        return true
      })
    case 'platforms':
      return scope.sites.some((site) => {
        // `gov` / `gov.in` are TLD sites; `linkedin.com/jobs` carries a path prefix.
        const [siteHost = '', ...pathParts] = site.toLowerCase().split('/')
        const path = pathParts.length ? `/${pathParts.join('/')}` : ''
        const hostOk = siteHost.includes('.')
          ? hostMatches(host, siteHost)
          : host.endsWith(`.${siteHost}`)
        return hostOk && (!path || url.pathname.toLowerCase().startsWith(path))
      })
  }
}

/**
 * Re-checks one SERP result against the query that produced it (D-016). Engines sometimes
 * drop `site:` or relax operators, so the runner must never trust the query alone.
 */
export const checkResult = (query: PlannedQuery, url: string, title: string): ResultCheck => {
  const parsed = parse(url)
  if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    return { inScope: false, excluded: false, signal: 'unknown' }
  }
  const host = parsed.hostname.toLowerCase()
  const excluded = query.excludedHosts.some((d) => hostMatches(host, d))

  const checks: boolean[] = []
  const { filetypes, inurl, intitle } = query.signal
  const path = parsed.pathname.toLowerCase()
  if (filetypes.length) {
    const ext = path.match(/\.([a-z0-9]{1,5})$/)?.[1]
    // PDFs are often served without an extension (T-001), so no extension = unknown.
    if (ext) checks.push(filetypes.includes(ext))
  }
  const href = url.toLowerCase()
  if (inurl.length) checks.push(inurl.some((t) => href.includes(t.toLowerCase())))
  const lowerTitle = title.toLowerCase()
  if (intitle.length) checks.push(intitle.some((t) => lowerTitle.includes(t.toLowerCase())))

  const signal = checks.length === 0 ? 'unknown' : checks.every(Boolean) ? 'match' : 'miss'
  return { inScope: inScope(parsed, query.scope), excluded, signal }
}
