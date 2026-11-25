import type { ScoredResult } from '@dextra/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Card, Segmented } from '../../components/ui'
import { api, type Feedback, type ReportResult, type RunSummary } from '../../lib/api'
import { cn } from '../../lib/cn'
import { GOAL_LABELS } from '../../lib/labels'

type Group = ScoredResult['group']

/** Rows visible before the list scrolls. */
const VISIBLE_ROWS = 7

const GROUP_LABELS: Record<Group, string> = {
  main: 'Results',
  outside: 'Outside scope',
  unverified: 'Unverified',
}

const GROUP_HINTS: Record<Group, string> = {
  main: 'Matched every filter.',
  outside: 'Found only after widening a filter. Each result says which.',
  unverified: 'Hosts outside your authorized scope. Listed for you to check; not searched further.',
}

/** Only http(s) links are rendered as links (results come from arbitrary pages). */
/** Google Videos links some results through an opaque redirect (D-028). */
const isGoogleRedirect = (url: string) => /^https:\/\/www\.google\.[a-z.]+\/goto\?/i.test(url)

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined)

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Useful / not useful (T-011). Clicking the active button again clears the rating. */
const RateButtons = ({
  value,
  onRate,
  title,
}: {
  value: Feedback | null
  onRate: (value: Feedback | null) => void
  title: string
}) => (
  <div className="flex shrink-0 gap-1">
    {(
      [
        ['useful', 'Useful', ThumbsUp],
        ['not_useful', 'Not useful', ThumbsDown],
      ] as const
    ).map(([v, label, Icon]) => (
      <button
        key={v}
        type="button"
        aria-pressed={value === v}
        aria-label={`${label}: ${title}`}
        title={label}
        onClick={() => onRate(value === v ? null : v)}
        className={cn(
          'rounded-md border p-1.5 transition-colors',
          value === v
            ? v === 'useful'
              ? 'border-ok bg-ok-soft text-ok'
              : 'border-danger bg-danger-soft text-danger'
            : 'border-border text-muted hover:text-text',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    ))}
  </div>
)

const ResultItem = ({
  r,
  rank,
  onRate,
}: {
  r: ReportResult
  rank: number
  onRate: (value: Feedback | null) => void
}) => {
  const href = safeHref(r.url)
  return (
    <li className="border-b border-border py-4 last:border-0">
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-right text-sm text-muted">{rank}</span>
        <div className="min-w-0 flex-1">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            >
              {r.title || hostOf(r.url)}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="font-medium">{r.title}</span>
          )}
          <p className="truncate text-xs text-muted">
            {isGoogleRedirect(r.url) && r.source ? `${r.source} (via Google)` : r.url}
          </p>
          {r.snippet && <p className="mt-1 text-sm">{r.snippet}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.reasons.map((reason) => (
              <Badge key={reason} tone="warn">
                {reason}
              </Badge>
            ))}
            {r.signal === 'match' && <Badge tone="ok">matches the signal</Badge>}
            {r.queryKeys.length > 1 && (
              <Badge tone="accent">found by {r.queryKeys.length} queries</Badge>
            )}
            {r.date && <Badge>{r.date}</Badge>}
            <Badge>score {r.score}</Badge>
          </div>
        </div>
        <RateButtons value={r.feedback} onRate={onRate} title={r.title || hostOf(r.url)} />
      </div>
    </li>
  )
}

/** Finished run: grouped, ranked results with exports (F5). */
export const Report = ({ run }: { run: RunSummary }) => {
  const stats = run.stats
  const [group, setGroup] = useState<Group>('main')
  const results = useQuery({
    queryKey: ['results', run.id, group],
    queryFn: () => api.getResults(run.id, group),
  })
  const list = results.data?.results ?? []

  const queryClient = useQueryClient()
  const rate = useMutation({
    mutationFn: ({ id, value }: { id: string; value: Feedback | null }) =>
      api.rateResult(run.id, id, value),
    // Show the rating at once; roll back if the server refuses it.
    onMutate: ({ id, value }) => {
      const key = ['results', run.id, group]
      const previous = queryClient.getQueryData<{ results: ReportResult[] }>(key)
      queryClient.setQueryData<{ results: ReportResult[] }>(key, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((r) => (r.id === id ? { ...r, feedback: value } : r)),
            }
          : old,
      )
      return { previous, key }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
      toast.error('Could not save your rating')
    },
  })

  const groups = (['main', 'outside', 'unverified'] as const).filter(
    (g) => g === 'main' || (stats?.[g] ?? 0) > 0,
  )

  // Show exactly the first VISIBLE_ROWS results; the rest scroll inside the list.
  const listRef = useRef<HTMLOListElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const measure = () => {
      const rows = Array.from(listRef.current?.children ?? []).slice(0, VISIBLE_ROWS)
      const total = rows.reduce((sum, row) => sum + (row as HTMLElement).offsetHeight, 0)
      setMaxHeight(list.length > VISIBLE_ROWS && total > 0 ? total : undefined)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [list])

  const [pdfBusy, setPdfBusy] = useState(false)
  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const { results: all } = await api.getAllResults(run.id)
      const { downloadResultsPdf } = await import('../../lib/pdf')
      await downloadResultsPdf(run, all)
    } catch {
      toast.error('Could not create the PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  const keywords = [...run.spec.keywords.all, ...run.spec.keywords.phrases]
  const downloadClass =
    'inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-60'

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{GOAL_LABELS[run.spec.goal]}</p>
        <h1 className="text-2xl font-semibold">Search results</h1>
        {keywords.length > 0 && (
          <p className="mt-1 text-sm text-muted">Keywords: {keywords.join(', ')}</p>
        )}
        {stats && (
          <p className="mt-1 text-sm text-muted">
            {stats.main} results · {stats.outside} outside scope
            {stats.unverified ? ` · ${stats.unverified} unverified` : ''} · {stats.requests}{' '}
            searches
            {stats.fallbackRan ? ' · wider fallback ran' : ''}
            {stats.errors.length ? ` · ${stats.errors.length} searches failed` : ''}
          </p>
        )}
      </div>

      {groups.length > 1 && (
        <Segmented
          label="Result group"
          value={group}
          onChange={setGroup}
          options={groups.map((g) => ({
            value: g,
            label: `${GROUP_LABELS[g]} (${stats?.[g] ?? 0})`,
          }))}
        />
      )}
      <p className="text-sm text-muted">
        {GROUP_HINTS[group]} Rate results with 👍 / 👎 to improve future searches.
      </p>

      <Card className="p-0">
        {results.isPending ? (
          <p className="px-5 py-6 text-sm text-muted">Loading results…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nothing in this group.</p>
        ) : (
          <ol
            ref={listRef}
            aria-label={`${GROUP_LABELS[group]} list`}
            style={{ maxHeight }}
            className="overflow-y-auto px-5"
          >
            {list.map((r, i) => (
              <ResultItem
                key={r.key}
                r={r}
                rank={i + 1}
                onRate={(value) => rate.mutate({ id: r.id, value })}
              />
            ))}
          </ol>
        )}
      </Card>
      {list.length > VISIBLE_ROWS && (
        <p className="-mt-3 text-xs text-muted">
          Showing {VISIBLE_ROWS} of {list.length} — scroll the list for more.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-sm text-muted">Download all results:</span>
        <a href={api.exportUrl(run.id, 'csv')} className={downloadClass}>
          <Download className="size-4" aria-hidden /> CSV
        </a>
        <a href={api.exportUrl(run.id, 'json')} className={downloadClass}>
          <Download className="size-4" aria-hidden /> JSON
        </a>
        <button type="button" onClick={downloadPdf} disabled={pdfBusy} className={downloadClass}>
          <Download className="size-4" aria-hidden /> {pdfBusy ? 'Creating PDF…' : 'PDF'}
        </button>
      </div>
    </div>
  )
}
