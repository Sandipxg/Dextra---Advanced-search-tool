import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Card } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { PlanSummary } from './PlanSummary'
import { Report } from './Report'

/** One run: summary while planned, progress while searching, report when done. */
export const RunPage = () => {
  const { id = '' } = useParams()
  const run = useQuery({
    queryKey: ['run', id],
    queryFn: () => api.getRun(id),
    refetchInterval: (q) => {
      const status = q.state.data?.run.status
      return status === 'confirmed' || status === 'running' ? 2000 : false
    },
  })

  if (run.isPending) return <p className="text-sm text-muted">Loading…</p>
  if (run.isError) {
    const notFound = run.error instanceof ApiError && run.error.status === 404
    return (
      <Card>
        <p className="font-medium">
          {notFound ? 'Search not found' : 'Could not load this search'}
        </p>
        <Link to="/runs" className="mt-2 inline-block text-sm text-accent">
          Back to my searches
        </Link>
      </Card>
    )
  }

  const data = run.data.run
  switch (data.status) {
    case 'planned':
      return <PlanSummary run={data} />
    case 'confirmed':
    case 'running':
      return (
        <Card className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
          <div role="status">
            <p className="font-medium">Searching…</p>
            <p className="text-sm text-muted">
              Running {data.plan.requests} searches. This page updates when the results are ready.
            </p>
          </div>
        </Card>
      )
    case 'done':
      return <Report run={data} />
    default:
      return (
        <Card className="border-danger">
          <p className="font-medium text-danger">
            This search {data.status === 'cancelled' ? 'was cancelled' : 'failed'}
          </p>
          {data.error && <p className="mt-1 text-sm text-muted">{data.error}</p>}
          <Link to="/" className="mt-3 inline-block text-sm text-accent">
            Start a new search
          </Link>
        </Card>
      )
  }
}
