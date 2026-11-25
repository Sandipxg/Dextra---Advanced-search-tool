import type { z } from 'zod'
import { type FetchLike, type ProviderId, SerpError, type TimeFilter } from './types'

/**
 * Fetch + parse with errors that never contain the request URL or headers,
 * since some providers take the API key as a query parameter.
 */
export const requestJson = async <T>(
  provider: ProviderId,
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> => {
  let res: Response
  try {
    res = await fetchFn(url, init)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new SerpError(provider, 'network error')
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200)
    throw new SerpError(provider, `HTTP ${res.status}${body ? `: ${body}` : ''}`, res.status)
  }
  const parsed = schema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new SerpError(provider, 'unexpected response shape')
  return parsed.data
}

const usDate = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}/${y}`
}

/** Google `tbs` value: `qdr:w` or `cdr:1,cd_min:1/31/2026,cd_max:2/28/2026`. */
export const toGoogleTbs = (time: TimeFilter): string =>
  time.kind === 'past'
    ? `qdr:${time.range}`
    : `cdr:1,cd_min:${usDate(time.from)},cd_max:${usDate(time.to)}`

/** Brave `freshness` value: `pw` or `2026-01-31to2026-02-28`. */
export const toBraveFreshness = (time: TimeFilter): string =>
  time.kind === 'past' ? `p${time.range}` : `${time.from}to${time.to}`

/** Drops undefined values and stringifies the rest. */
export const compact = (params: Record<string, string | number | undefined>) =>
  Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  )
