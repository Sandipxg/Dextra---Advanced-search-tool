import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Badge, Card } from '../../components/ui'
import { api, type RunStatus } from '../../lib/api'
import { GOAL_LABELS } from '../../lib/labels'

const STATUS: Record<
  RunStatus,
  { label: string; tone: 'neutral' | 'accent' | 'ok' | 'danger' | 'warn' }
> = {
  planned: { label: 'Waiting for confirmation', tone: 'warn' },
  confirmed: { label: 'Starting', tone: 'accent' },
  running: { label: 'Searching', tone: 'accent' },
  done: { label: 'Done', tone: 'ok' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/** The signed-in user's 20 most recent searches. */
export const RunsPage = () => {
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My searches</h1>
      {runs.isPending && <p className="text-sm text-muted">Loading…</p>}
      {runs.isError && <p className="text-sm text-danger">Could not load your searches.</p>}
      {runs.data?.runs.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            No searches yet.{' '}
            <Link to="/" className="text-accent">
              Start one
            </Link>
            .
          </p>
        </Card>
      )}
      <ul className="space-y-2">
        {runs.data?.runs.map((r) => (
          <li key={r.id}>
            <Link
              to={`/runs/${r.id}`}
              className="block rounded-lg border border-border bg-surface p-4 hover:bg-surface-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted">
                  {GOAL_LABELS[r.goal as keyof typeof GOAL_LABELS] ?? r.goal}
                </span>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </div>
              <p className="mt-1 font-medium">{r.description}</p>
              <p className="mt-1 text-xs text-muted">{new Date(r.createdAt).toLocaleString()}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
