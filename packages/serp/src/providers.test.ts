import { describe, expect, it, vi } from 'vitest'
import { toBraveFreshness, toGoogleTbs } from './http'
import { buildBraveRequest, createBraveProvider } from './providers/brave'
import { buildSerpApiRequest, createSerpApiProvider } from './providers/serpapi'
import { buildSerperRequest, createSerperProvider } from './providers/serper'
import { createProviders, resolveProvider } from './registry'
import { type FetchLike, type SearchRequest, SerpError } from './types'

const KEY = 'secret-key-123'

const base: SearchRequest = {
  q: 'site:example.com filetype:pdf',
  engine: 'google',
  type: 'web',
  num: 20,
  page: 1,
}

const jsonFetch =
  (body: unknown, status = 200): FetchLike =>
  async () =>
    new Response(JSON.stringify(body), { status })

describe('time mapping', () => {
  it('maps past ranges', () => {
    expect(toGoogleTbs({ kind: 'past', range: 'w' })).toBe('qdr:w')
    expect(toBraveFreshness({ kind: 'past', range: 'y' })).toBe('py')
  })

  it('maps custom ranges', () => {
    const time = { kind: 'custom', from: '2026-01-05', to: '2026-02-28' } as const
    expect(toGoogleTbs(time)).toBe('cdr:1,cd_min:1/5/2026,cd_max:2/28/2026')
    expect(toBraveFreshness(time)).toBe('2026-01-05to2026-02-28')
  })
})

describe('serper', () => {
  it('builds a POST with location, language and time', () => {
    const { url, init } = buildSerperRequest(
      { ...base, country: 'in', language: 'en', time: { kind: 'past', range: 'm' } },
      KEY,
    )
    expect(url).toBe('https://google.serper.dev/search')
    expect(init.headers['X-API-KEY']).toBe(KEY)
    expect(JSON.parse(init.body)).toEqual({
      q: base.q,
      gl: 'in',
      hl: 'en',
      tbs: 'qdr:m',
      num: 20,
      page: 1,
    })
  })

  it('uses the news endpoint and parses news results', async () => {
    expect(buildSerperRequest({ ...base, type: 'news' }, KEY).url).toMatch(/\/news$/)
    const provider = createSerperProvider(
      KEY,
      jsonFetch({ news: [{ link: 'https://a.com/x', title: 'T', snippet: 'S', source: 'A' }] }),
    )
    const res = await provider.search({ ...base, type: 'news' })
    expect(res.results).toEqual([
      { url: 'https://a.com/x', title: 'T', snippet: 'S', position: 1, source: 'A' },
    ])
  })

  it('serves only google', () => {
    const p = createSerperProvider(KEY)
    expect(p.supports('google', 'scholar')).toBe(true)
    expect(p.supports('bing', 'web')).toBe(false)
  })
})

describe('serpapi', () => {
  it('builds a google request with offset paging and news tbm', () => {
    const { url } = buildSerpApiRequest({ ...base, type: 'news', page: 3, country: 'in' }, KEY)
    const params = new URL(url).searchParams
    expect(params.get('engine')).toBe('google')
    expect(params.get('tbm')).toBe('nws')
    expect(params.get('start')).toBe('40')
    expect(params.get('gl')).toBe('in')
  })

  it('maps bing and reports params it cannot apply', () => {
    const { url, ignored } = buildSerpApiRequest(
      {
        ...base,
        engine: 'bing',
        country: 'in',
        language: 'hi',
        time: { kind: 'past', range: 'd' },
      },
      KEY,
    )
    const params = new URL(url).searchParams
    expect(params.get('engine')).toBe('bing')
    expect(params.get('cc')).toBe('in')
    expect(params.get('count')).toBe('20')
    expect(params.get('first')).toBe('1')
    expect(ignored).toEqual(['language', 'time'])
  })

  it('maps scholar custom dates to years and caps num', () => {
    const { url } = buildSerpApiRequest(
      {
        ...base,
        type: 'scholar',
        num: 50,
        time: { kind: 'custom', from: '2020-01-01', to: '2024-12-31' },
      },
      KEY,
    )
    const params = new URL(url).searchParams
    expect(params.get('engine')).toBe('google_scholar')
    expect(params.get('num')).toBe('20')
    expect(params.get('as_ylo')).toBe('2020')
    expect(params.get('as_yhi')).toBe('2024')
  })

  it('parses organic results and object sources', async () => {
    const provider = createSerpApiProvider(
      KEY,
      jsonFetch({
        organic_results: [
          { position: 4, link: 'https://b.com', title: 'B', snippet: 's', source: { name: 'Bee' } },
        ],
      }),
    )
    const res = await provider.search(base)
    expect(res.results[0]).toEqual({
      url: 'https://b.com',
      title: 'B',
      snippet: 's',
      position: 4,
      source: 'Bee',
    })
  })
})

describe('brave', () => {
  it('caps count and page, flags what it changed', () => {
    const { url, init, ignored } = buildBraveRequest(
      { ...base, engine: 'brave', num: 50, page: 15, country: 'in', location: 'Ahmedabad' },
      KEY,
    )
    const params = new URL(url).searchParams
    expect(params.get('count')).toBe('20')
    expect(params.get('offset')).toBe('9')
    expect(params.get('country')).toBe('IN')
    expect(init.headers['X-Subscription-Token']).toBe(KEY)
    expect(ignored).toEqual(['location', 'num', 'page'])
  })

  it('parses web results', async () => {
    const provider = createBraveProvider(
      KEY,
      jsonFetch({
        web: {
          results: [{ url: 'https://c.com', title: 'C', description: 'd', age: '2 days ago' }],
        },
      }),
    )
    const res = await provider.search({ ...base, engine: 'brave' })
    expect(res.results).toEqual([
      { url: 'https://c.com', title: 'C', snippet: 'd', position: 1, date: '2 days ago' },
    ])
  })
})

describe('errors', () => {
  it('never leaks the API key from a query-string provider', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => new Response('quota exceeded', { status: 429 }))
    const provider = createSerpApiProvider(KEY, fetchFn)
    const err = await provider.search(base).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SerpError)
    expect((err as SerpError).status).toBe(429)
    expect(String((err as Error).message)).not.toContain(KEY)
  })

  it('rejects unexpected response shapes', async () => {
    const provider = createSerperProvider(KEY, jsonFetch({ organic: 'nope' }))
    await expect(provider.search(base)).rejects.toThrow(/unexpected response shape/)
  })

  it('wraps network failures without details', async () => {
    const provider = createBraveProvider(KEY, async () => {
      throw new TypeError(`fetch failed for ${KEY}`)
    })
    const err = (await provider.search({ ...base, engine: 'brave' }).catch((e) => e)) as Error
    expect(err.message).toBe('[brave] network error')
  })
})

describe('registry', () => {
  it('builds providers for configured keys only, in preference order', () => {
    const providers = createProviders({ BRAVE_API_KEY: 'b', SERPER_API_KEY: 's' })
    expect(providers.map((p) => p.id)).toEqual(['serper', 'brave'])
  })

  it('resolves the first provider that serves engine + type', () => {
    const providers = createProviders({ SERPER_API_KEY: 's', SERPAPI_API_KEY: 'a' })
    expect(resolveProvider(providers, 'google', 'web')?.id).toBe('serper')
    expect(resolveProvider(providers, 'bing', 'web')?.id).toBe('serpapi')
    expect(resolveProvider(providers, 'brave', 'web')).toBeUndefined()
  })
})
