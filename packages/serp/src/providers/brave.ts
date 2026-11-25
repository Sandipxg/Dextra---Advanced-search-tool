import { z } from 'zod'
import { compact, requestJson, toBraveFreshness } from '../http'
import type { FetchLike, SearchRequest, SearchResponse, SerpProvider } from '../types'

/** Brave caps `count` at 20 and `offset` (page index) at 9. */
const MAX_COUNT = 20
const MAX_OFFSET = 9

const Item = z.object({
  url: z.string(),
  title: z.string().default(''),
  description: z.string().default(''),
  age: z.string().optional(),
  meta_url: z.object({ hostname: z.string() }).partial().optional(),
})
const WebResponse = z.object({ web: z.object({ results: z.array(Item) }).optional() })
const NewsResponse = z.object({ results: z.array(Item).optional() })

export const buildBraveRequest = (req: SearchRequest, apiKey: string) => {
  const ignored: Array<keyof SearchRequest> = []
  if (req.location) ignored.push('location')
  if (req.num > MAX_COUNT) ignored.push('num')
  if (req.page - 1 > MAX_OFFSET) ignored.push('page')

  const path = req.type === 'news' ? 'news/search' : 'web/search'
  const query = new URLSearchParams(
    compact({
      q: req.q,
      country: req.country?.toUpperCase(),
      search_lang: req.language,
      count: Math.min(req.num, MAX_COUNT),
      offset: Math.min(req.page - 1, MAX_OFFSET),
      freshness: req.time && toBraveFreshness(req.time),
    }),
  )
  return {
    url: `https://api.search.brave.com/res/v1/${path}?${query}`,
    init: {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    },
    ignored,
  }
}

export const parseBraveItems = (items: z.infer<typeof Item>[]) =>
  items.map((r, i) => ({
    url: r.url,
    title: r.title,
    snippet: r.description,
    position: i + 1,
    ...(r.age ? { date: r.age } : {}),
    ...(r.meta_url?.hostname ? { source: r.meta_url.hostname } : {}),
  }))

/** Brave Search API — Brave index only (web, news). */
export const createBraveProvider = (apiKey: string, fetchFn: FetchLike = fetch): SerpProvider => ({
  id: 'brave',
  supports: (engine, type) => engine === 'brave' && (type === 'web' || type === 'news'),
  async search(req, signal): Promise<SearchResponse> {
    const { url, init, ignored } = buildBraveRequest(req, apiKey)
    const opts = { ...init, signal: signal ?? null }
    const items =
      req.type === 'news'
        ? ((await requestJson('brave', fetchFn, url, opts, NewsResponse)).results ?? [])
        : ((await requestJson('brave', fetchFn, url, opts, WebResponse)).web?.results ?? [])
    return {
      provider: 'brave',
      engine: req.engine,
      type: req.type,
      results: parseBraveItems(items),
      ignored,
    }
  },
})
