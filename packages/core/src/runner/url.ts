/** Query params that only track clicks; dropped before deduping. */
const TRACKING =
  /^(utm_[a-z_]+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref|ref_src|_hsenc|_hsmi|igshid)$/i

/**
 * Dedupe key for a URL: scheme-less, lowercase host without `www.`, no default port,
 * no fragment, no tracking params, sorted params, no trailing slash (except root).
 * Returns null for anything that isn't http(s).
 */
export const normalizeUrl = (raw: string): string | null => {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
  const query = params.length ? `?${new URLSearchParams(params)}` : ''
  let path = url.pathname.replace(/\/{2,}/g, '/')
  if (path.length > 1) path = path.replace(/\/$/, '')
  return `${host}${path === '/' ? '' : path}${query}`
}
