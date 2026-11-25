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
  displayed_link: z.string().optional(),
})

/**
 * Google Videos often links through `google.com/goto?url=<opaque>`; the real site is only in
 * `displayed_link` ("www.youtube.com › watch"). Keep the working link, name the site.
 */
const redirectSource = (link: string, displayed?: string): string | undefined => {
  if (!/^https:\/\/www\.google\.[a-z.]+\/goto\?/i.test(link) || !displayed) return undefined
  return displayed.split(' ')[0]?.trim() || undefined
}
const Response = z.object({
  organic_results: z.array(Item).optional(),
  news_results: z.array(Item).optional(),
  video_results: z.array(Item).optional(),
  /** Google Images: `link` is the page the image is on. */
  images_results: z.array(Item).optional(),
})

/** Google Images returns 100 results per `ijn` page, whatever `num` says. */
const IMAGES_PER_PAGE = 100

const SUPPORTED: Record<Engine, readonly ResultType[]> = {
  google: ['web', 'news', 'scholar', 'videos', 'images'],
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
  } else if (req.type === 'images') {
    params = {
      engine: 'google_images',
      q: req.q,
      gl: req.country,
      hl: req.language,
      location: req.location,
      tbs: req.time && toGoogleTbs(req.time),
      ijn: Math.floor(offset / IMAGES_PER_PAGE),
    }
  } else {
    params = {
      engine: 'google',
      q: req.q,
      gl: req.country,
      hl: req.language,
      location: req.location,
      tbs: req.time && toGoogleTbs(req.time),
      tbm: req.type === 'news' ? 'nws' : req.type === 'videos' ? 'vid' : undefined,
      num: req.num,
      start: offset,
    }
  }

  const query = new URLSearchParams({ ...compact(params), api_key: apiKey })
  return { url: `https://serpapi.com/search.json?${query}`, init: { method: 'GET' }, ignored }
}

/** Images come 100 per page: keep the slice that matches the requested page. */
const sliceFor = <T>(items: T[], req?: Pick<SearchRequest, 'type' | 'num' | 'page'>): T[] => {
  if (req?.type !== 'images') return items
  const start = ((req.page - 1) * req.num) % IMAGES_PER_PAGE
  return items.slice(start, start + req.num)
}

export const parseSerpApiResponse = (
  data: z.infer<typeof Response>,
  req?: Pick<SearchRequest, 'type' | 'num' | 'page'>,
) =>
  sliceFor(
    data.news_results ?? data.video_results ?? data.images_results ?? data.organic_results ?? [],
    req,
  ).map((r, i) => {
    const source =
      typeof r.source === 'string'
        ? r.source
        : (r.source?.name ?? redirectSource(r.link, r.displayed_link))
    return {
      url: r.link,
      title: r.title,
      snippet: r.snippet,
      position: r.position ?? i + 1,
      ...(r.date ? { date: r.date } : {}),
      ...(source ? { source } : {}),
    }
  })

/** SerpAPI — Google (web, news, scholar, videos, images) and Bing (web). */
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
      results: parseSerpApiResponse(data, req),
      ignored,
    }
  },
})
