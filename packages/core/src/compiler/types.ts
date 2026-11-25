import type { Engine, Strictness } from '../schema/enums'
import type { Goal } from '../schema/goal'
import type { TemplateId } from '../templates/index'

export type TimeFilter =
  | { kind: 'past'; range: 'd' | 'w' | 'm' | 'y' }
  | { kind: 'custom'; from: string; to: string }

/** Filters a Soft fallback / outside batch can widen. */
export type WidenableFilter = 'scope' | 'country' | 'location' | 'language' | 'time' | 'content'

/** Which hosts a result may come from (re-checked in code, D-016). */
export type ResultScope =
  | { kind: 'domains'; domains: string[]; subdomains: 'include' | 'exclude' | 'only' }
  | { kind: 'platforms'; sites: string[] }
  | { kind: 'any' }

/** What a hit should look like, where it can be checked from URL/title. */
export interface SignalCheck {
  filetypes: string[]
  inurl: string[]
  intitle: string[]
}

export interface PlannedQuery {
  /** Stable within a plan: `templateId#n` plus batch suffix. */
  key: string
  templateId: TemplateId
  goal: Goal
  priority: 1 | 2 | 3
  /** True when borrowed from another goal (D-010). */
  crossGoal: boolean
  q: string
  engine: Engine
  type: 'web' | 'news' | 'scholar'
  country?: string
  language?: string
  location?: string
  time?: TimeFilter
  /** Pages of 10 results (D-017). */
  pages: number
  /** primary = always runs; fallback = only if primary results < min_results; outside = F4. */
  batch: 'primary' | 'fallback' | 'outside'
  /** Filters removed relative to the primary query. */
  widened: WidenableFilter[]
  scope: ResultScope
  /** Hosts that must never appear (B3 + E4). */
  excludedHosts: string[]
  signal: SignalCheck
}

export interface DroppedTemplate {
  templateId: TemplateId
  reason: string
}

export interface RejectedQuery {
  templateId: TemplateId
  q: string
  violations: string[]
}

export interface Plan {
  queries: PlannedQuery[]
  dropped: DroppedTemplate[]
  rejected: RejectedQuery[]
  budget: number
  /** Requests that always run (primary + outside), counting pages. */
  requests: number
  /** Extra requests if every fallback triggers. */
  maxFallbackRequests: number
  strictness: Record<WidenableFilter, Strictness | 'n/a'>
}
