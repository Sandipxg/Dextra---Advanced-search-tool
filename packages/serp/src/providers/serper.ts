import { z } from 'zod'
import { compact, requestJson, toGoogleTbs } from '../http'
import type { FetchLike, SearchRequest, SearchResponse, SerpProvider } from '../types'

const ENDPOINT = { web: 'search', news: 'news', scholar: 'scholar' } as const

const Item = z.object({
  link: z.string(),
  title: z.string().default(''),
  snippet: z.string().default(''),
  position: z.number().optional(),
  date: z.string().optional(),
  source: z.string().optional(),
})
const Response = z.object({
  organic: z.array(Item).optional(),
  news: z.array(Item).optional(),
})

/** Builds the HTTP request. Pure, so it is unit-tested without network. */
export const buildSerperRequest = (req: SearchRequest, apiKey: string) => ({
  url: `https://google.serper.dev/${ENDPOINT[req.type]}`,
  init: {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: req.q,
      ...compact({
        gl: req.country,
        hl: req.language,
        location: req.location,
        tbs: req.time && toGoogleTbs(req.time),
      }),
      num: req.num,
      page: req.page,
    }),
  } satisfies RequestInit,
})

export const parseSerperResponse = (data: z.infer<typeof Response>) =>
  (data.news ?? data.organic ?? []).map((r, i) => ({
    url: r.link,
    title: r.title,
    snippet: r.snippet,
    position: r.position ?? i + 1,
    ...(r.date ? { date: r.date } : {}),
    ...(r.source ? { source: r.source } : {}),
  }))

/** Serper.dev — Google results only (web, news, scholar). */
export const createSerperProvider = (apiKey: string, fetchFn: FetchLike = fetch): SerpProvider => ({
  id: 'serper',
  supports: (engine) => engine === 'google',
  async search(req, signal): Promise<SearchResponse> {
    const { url, init } = buildSerperRequest(req, apiKey)
    const data = await requestJson(
      'serper',
      fetchFn,
      url,
      { ...init, signal: signal ?? null },
      Response,
    )
    return {
      provider: 'serper',
      engine: req.engine,
      type: req.type,
      results: parseSerperResponse(data),
      ignored: [],
    }
  },
})
