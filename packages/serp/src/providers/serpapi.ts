import { z } from 'zod'
import { compact, requestJson, toGoogleTbs } from '../http'
import type {
  Engine,
  FetchLike,
  ResultType,
  SearchRequest,
  SearchResponse,
  SerpProvider,
} from '../types'

const Item = z.object({
  link: z.string(),
  title: z.string().default(''),
  snippet: z.string().default(''),
  position: z.number().optional(),
  date: z.string().optional(),
  source: z.union([z.string(), z.object({ name: z.string() })]).optional(),
})
const Response = z.object({
  organic_results: z.array(Item).optional(),
  news_results: z.array(Item).optional(),
})

const SUPPORTED: Record<Engine, readonly ResultType[]> = {
  google: ['web', 'news', 'scholar'],
  bing: ['web'],
  brave: [],
}

/**
 * Builds the HTTP request plus the list of request fields the target engine can't apply.
 * Pure, so it is unit-tested without network.
 */
export const buildSerpApiRequest = (req: SearchRequest, apiKey: string) => {
  const offset = (req.page - 1) * req.num
  const ignored: Array<keyof SearchRequest> = []
  let params: Record<string, string | number | undefined>

  if (req.engine === 'bing') {
    // Bing via SerpAPI: no hl/location/time mapping in v1.
    if (req.language) ignored.push('language')
    if (req.location) ignored.push('location')
    if (req.time) ignored.push('time')
    params = { engine: 'bing', q: req.q, cc: req.country, count: req.num, first: offset + 1 }
  } else if (req.type === 'scholar') {
    if (req.country) ignored.push('country')
    if (req.location) ignored.push('location')
    // Scholar filters by year only.
    const years =
      req.time?.kind === 'custom'
        ? { as_ylo: req.time.from.slice(0, 4), as_yhi: req.time.to.slice(0, 4) }
        : {}
    if (req.time?.kind === 'past') ignored.push('time')
    params = {
      engine: 'google_scholar',
      q: req.q,
      hl: req.language,
      num: Math.min(req.num, 20),
      start: offset,
      ...years,
    }
  } else {
    params = {
      engine: 'google',
      q: req.q,
      gl: req.country,
      hl: req.language,
      location: req.location,
      tbs: req.time && toGoogleTbs(req.time),
      tbm: req.type === 'news' ? 'nws' : undefined,
      num: req.num,
      start: offset,
    }
  }

  const query = new URLSearchParams({ ...compact(params), api_key: apiKey })
  return { url: `https://serpapi.com/search.json?${query}`, init: { method: 'GET' }, ignored }
}

export const parseSerpApiResponse = (data: z.infer<typeof Response>) =>
  (data.news_results ?? data.organic_results ?? []).map((r, i) => {
    const source = typeof r.source === 'string' ? r.source : r.source?.name
    return {
      url: r.link,
      title: r.title,
      snippet: r.snippet,
      position: r.position ?? i + 1,
      ...(r.date ? { date: r.date } : {}),
      ...(source ? { source } : {}),
    }
  })

/** SerpAPI — Google (web, news, scholar) and Bing (web). */
export const createSerpApiProvider = (
  apiKey: string,
  fetchFn: FetchLike = fetch,
): SerpProvider => ({
  id: 'serpapi',
  supports: (engine, type) => SUPPORTED[engine].includes(type),
  async search(req, signal): Promise<SearchResponse> {
    const { url, init, ignored } = buildSerpApiRequest(req, apiKey)
    const data = await requestJson(
      'serpapi',
      fetchFn,
      url,
      { ...init, signal: signal ?? null },
      Response,
    )
    return {
      provider: 'serpapi',
      engine: req.engine,
      type: req.type,
      results: parseSerpApiResponse(data),
      ignored,
    }
  },
})
