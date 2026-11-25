import type { SearchFn } from '@dextra/core'
import { resolveProvider, type SearchRequest, type SerpProvider } from '@dextra/serp'

/** Connects the runner to the configured SERP providers (D-015, D-017). */
export const createSearch =
  (providers: readonly SerpProvider[]): SearchFn =>
  async (query, page, signal) => {
    const provider = resolveProvider(providers, query.engine, query.type)
    if (!provider) throw new Error(`No SERP provider configured for ${query.engine} ${query.type}`)
    const request: SearchRequest = {
      q: query.q,
      engine: query.engine,
      type: query.type,
      num: 10,
      page,
      ...(query.country ? { country: query.country } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.location ? { location: query.location } : {}),
      ...(query.time ? { time: query.time } : {}),
    }
    const response = await provider.search(request, signal)
    return response.results
  }
