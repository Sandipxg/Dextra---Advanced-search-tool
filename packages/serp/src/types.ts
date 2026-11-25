/** Search engines a query can target (E1). */
export type Engine = 'google' | 'bing' | 'brave'

/** SERP endpoint (E2). */
export type ResultType = 'web' | 'news' | 'scholar' | 'videos' | 'images'

export type ProviderId = 'serper' | 'serpapi' | 'brave'

/** C4/C5 time filter in canonical form; each adapter maps it to its own parameter. */
export type TimeFilter =
  | { kind: 'past'; range: 'd' | 'w' | 'm' | 'y' }
  | { kind: 'custom'; from: string; to: string } // ISO dates, YYYY-MM-DD

/** One query, already compiled and guarded. Adapters never change `q`. */
export interface SearchRequest {
  q: string
  engine: Engine
  type: ResultType
  /** ISO 3166-1 alpha-2, lowercase (C1 → gl / cc / country). */
  country?: string
  /** ISO 639-1 (C3 → hl / search_lang). */
  language?: string
  /** Canonical SERP location name (C2), Google engines only. */
  location?: string
  time?: TimeFilter
  /** Results per page (F2). Providers may cap this. */
  num: number
  /** 1-based page. */
  page: number
}

export interface SerpResult {
  url: string
  title: string
  snippet: string
  /** 1-based rank within this response. */
  position: number
  date?: string
  source?: string
}

export interface SearchResponse {
  provider: ProviderId
  engine: Engine
  type: ResultType
  results: SerpResult[]
  /** Request fields this provider/engine could not apply (shown in the report, never silent). */
  ignored: Array<keyof SearchRequest>
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface SerpProvider {
  readonly id: ProviderId
  supports(engine: Engine, type: ResultType): boolean
  search(req: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>
}

export class SerpError extends Error {
  constructor(
    readonly provider: ProviderId,
    message: string,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'SerpError'
  }
}
