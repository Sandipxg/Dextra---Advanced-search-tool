import type { PlannedQuery } from '@dextra/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Badge, Button, Card } from '../../components/ui'
import { api, type RunSummary } from '../../lib/api'
import { GOAL_LABELS, STRICTNESS_LABELS } from '../../lib/labels'

const FILTER_LABELS = {
  scope: 'Domains',
  country: 'Country',
  location: 'City or region',
  language: 'Language',
  time: 'Time range',
  content: 'Content types',
} as const

const QueryList = ({ queries }: { queries: PlannedQuery[] }) => (
  <ol className="space-y-2">
    {queries.map((q) => (
      <li key={q.key} className="rounded-md border border-border bg-surface-2 px-3 py-2">
        <code className="block break-all font-mono text-[13px]">{q.q}</code>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge>{q.templateId}</Badge>
          {q.crossGoal && <Badge tone="accent">borrowed from {GOAL_LABELS[q.goal]}</Badge>}
          {q.pages > 1 && <Badge>{q.pages} pages</Badge>}
          {q.country && <Badge>country: {q.country}</Badge>}
          {q.time && (
            <Badge>
              {q.time.kind === 'past' ? `past ${q.time.range}` : `${q.time.from} → ${q.time.to}`}
            </Badge>
          )}
          {q.widened.length > 0 && <Badge tone="warn">widens: {q.widened.join(', ')}</Badge>}
        </div>
      </li>
    ))}
  </ol>
)

/** Pre-run summary: what will run, what it costs, what to exclude. Nothing runs before confirm. */
export const PlanSummary = ({ run }: { run: RunSummary }) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { plan, proposedExclusions } = run
  const [terms, setTerms] = useState<string[]>(proposedExclusions.terms)
  const [sites, setSites] = useState<string[]>(proposedExclusions.sites)

  const confirm = useMutation({
    mutationFn: () => api.confirmRun(run.id, { terms, sites }),
    onSuccess: ({ skippedExclusions }) => {
      if (skippedExclusions.length)
        toast.info(`Not excluded (target or invalid): ${skippedExclusions.join(', ')}`)
      void queryClient.invalidateQueries({ queryKey: ['run', run.id] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not start the search'),
  })

  const primary = plan.queries.filter((q) => q.batch === 'primary')
  const outside = plan.queries.filter((q) => q.batch === 'outside')
  const fallback = plan.queries.filter((q) => q.batch === 'fallback')
  const strictness = Object.entries(plan.strictness).filter(([, mode]) => mode !== 'n/a')
  const toggle = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{GOAL_LABELS[run.spec.goal]}</p>
        <h1 className="text-2xl font-semibold">Review the plan</h1>
        <p className="mt-1 text-sm text-muted">{run.spec.description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Searches now</p>
          <p className="text-3xl font-semibold">{plan.requests}</p>
          <p className="text-xs text-muted">paid requests (pages of 10)</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Possible extra</p>
          <p className="text-3xl font-semibold">{plan.maxFallbackRequests}</p>
          <p className="text-xs text-muted">only if results fall short</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Queries</p>
          <p className="text-3xl font-semibold">{primary.length}</p>
          <p className="text-xs text-muted">of a {plan.budget}-query budget</p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold">How templates were picked</h2>
          <Badge tone={run.selectorSource === 'llm' ? 'accent' : 'neutral'}>
            {run.selectorSource === 'llm' ? 'AI selection' : 'Default rules'}
          </Badge>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {run.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {strictness.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {strictness.map(([filter, mode]) => (
              <Badge key={filter} tone={mode === 'hard' ? 'accent' : 'neutral'}>
                {FILTER_LABELS[filter as keyof typeof FILTER_LABELS]}:{' '}
                {STRICTNESS_LABELS[mode as 'hard']}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {run.followUpQuestion && (
        <Card className="border-accent bg-accent-soft/40">
          <h2 className="mb-1 text-base font-semibold">One question</h2>
          <p className="text-sm">{run.followUpQuestion}</p>
          <p className="mt-2 text-xs text-muted">
            Add keywords under Advanced options and plan again for better results.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-base font-semibold">Planned queries</h2>
        {primary.length === 0 ? (
          <p className="text-sm text-muted">
            No queries could be planned for this request. Edit the search and add more detail.
          </p>
        ) : (
          <QueryList queries={primary} />
        )}
        {outside.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Outside your filters (always runs)</h3>
            <QueryList queries={outside} />
          </>
        )}
        {fallback.length > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold">
              Wider fallback queries ({fallback.length}) — only if results fall short
            </summary>
            <div className="mt-2">
              <QueryList queries={fallback} />
            </div>
          </details>
        )}
        {(plan.dropped.length > 0 || plan.rejected.length > 0) && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold">
              Left out ({plan.dropped.length + plan.rejected.length})
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {plan.dropped.map((d) => (
                <li key={`${d.templateId}-${d.reason}`}>
                  <code className="font-mono">{d.templateId}</code>: {d.reason}
                </li>
              ))}
              {plan.rejected.map((r) => (
                <li key={r.q}>
                  <code className="font-mono">{r.templateId}</code>: blocked by safety check (
                  {r.violations.join('; ')})
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {(proposedExclusions.terms.length > 0 || proposedExclusions.sites.length > 0) && (
        <Card>
          <h2 className="mb-1 text-base font-semibold">Suggested exclusions</h2>
          <p className="mb-3 text-sm text-muted">
            From what you said you don't want. Untick anything you want to keep.
          </p>
          <div className="flex flex-wrap gap-3">
            {proposedExclusions.terms.map((t) => (
              <label key={`t-${t}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={terms.includes(t)}
                  onChange={() => toggle(terms, setTerms, t)}
                />
                word: <code className="font-mono">-{t}</code>
              </label>
            ))}
            {proposedExclusions.sites.map((s) => (
              <label key={`s-${s}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={sites.includes(s)}
                  onChange={() => toggle(sites, setSites, s)}
                />
                site: <code className="font-mono">-site:{s}</code>
              </label>
            ))}
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate('/')}>
          Start over
        </Button>
        <Button
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending || primary.length === 0}
        >
          {confirm.isPending ? 'Starting…' : `Confirm and run ${plan.requests} searches`}
        </Button>
      </div>
    </div>
  )
}
