import { createBraveProvider } from './providers/brave'
import { createSerpApiProvider } from './providers/serpapi'
import { createSerperProvider } from './providers/serper'
import type { Engine, FetchLike, ProviderId, ResultType, SerpProvider } from './types'

export interface ProviderKeys {
  SERPER_API_KEY?: string | undefined
  SERPAPI_API_KEY?: string | undefined
  BRAVE_API_KEY?: string | undefined
}

/** Order of preference when several providers can serve the same engine + type. */
export const DEFAULT_PREFERENCE: readonly ProviderId[] = ['serper', 'serpapi', 'brave']

/** Builds one provider per configured key, in preference order. */
export const createProviders = (keys: ProviderKeys, fetchFn: FetchLike = fetch): SerpProvider[] => {
  const all: Record<ProviderId, SerpProvider | undefined> = {
    serper: keys.SERPER_API_KEY ? createSerperProvider(keys.SERPER_API_KEY, fetchFn) : undefined,
    serpapi: keys.SERPAPI_API_KEY
      ? createSerpApiProvider(keys.SERPAPI_API_KEY, fetchFn)
      : undefined,
    brave: keys.BRAVE_API_KEY ? createBraveProvider(keys.BRAVE_API_KEY, fetchFn) : undefined,
  }
  return DEFAULT_PREFERENCE.flatMap((id) => all[id] ?? [])
}

/** First configured provider that serves this engine + type, or undefined. */
export const resolveProvider = (
  providers: readonly SerpProvider[],
  engine: Engine,
  type: ResultType,
): SerpProvider | undefined => providers.find((p) => p.supports(engine, type))
