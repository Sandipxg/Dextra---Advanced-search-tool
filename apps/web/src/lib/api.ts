import type {
  IntakeSpec,
  IntakeSpecInput,
  Plan,
  ProposedExclusions,
  ScoredResult,
} from '@dextra/core'

export type RunStatus = 'planned' | 'confirmed' | 'running' | 'done' | 'failed' | 'cancelled'

export interface RunStats {
  requests: number
  fallbackRan: boolean
  errors: Array<{ queryKey: string; message: string }>
  main: number
  outside: number
  unverified: number
}

/** `toSummary` in apps/api. */
export interface RunSummary {
  id: string
  status: RunStatus
  spec: IntakeSpec
  selectorSource: 'llm' | 'rules'
  notes: string[]
  plan: Plan
  proposedExclusions: ProposedExclusions
  followUpQuestion: string | null
  createdAt: string
  confirmedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  stats: RunStats | null
  error: string | null
}

export interface RunListItem {
  id: string
  status: RunStatus
  goal: string
  description: string
  createdAt: string
}

export interface FieldIssue {
  path: string
  message: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    issues?: FieldIssue[]
  } & T
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? `Request failed (${res.status})`,
      body.issues ?? [],
    )
  }
  return body
}

export const api = {
  createPlan: (spec: IntakeSpecInput) =>
    request<{ run: RunSummary }>('/api/plans', { method: 'POST', body: JSON.stringify(spec) }),
  confirmRun: (id: string, exclusions: ProposedExclusions) =>
    request<{ run: RunSummary; skippedExclusions: string[] }>(`/api/runs/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ exclusions }),
    }),
  getRun: (id: string) => request<{ run: RunSummary }>(`/api/runs/${id}`),
  listRuns: () => request<{ runs: RunListItem[] }>('/api/runs'),
  getResults: (id: string, group: ScoredResult['group']) =>
    request<{ results: ScoredResult[]; stats: RunStats | null }>(
      `/api/runs/${id}/results?group=${group}&limit=200`,
    ),
  locations: (country: string, q: string) =>
    request<{
      locations: Array<{ id: number; name: string; canonicalName: string; targetType: string }>
    }>(`/api/locations?country=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}`),
  exportUrl: (id: string, format: 'csv' | 'json') => `/api/runs/${id}/export?format=${format}`,
}
