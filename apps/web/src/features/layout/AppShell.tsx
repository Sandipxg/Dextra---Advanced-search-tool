import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { Button, Switch } from '../../components/ui'
import { authClient } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { useSettings } from '../../lib/settings'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-1.5 text-sm',
    isActive ? 'bg-surface-2 font-medium' : 'text-muted hover:text-text',
  )

/** Signed-in layout: header with navigation, the advanced-options switch and sign-out. */
export const AppShell = () => {
  const session = authClient.useSession()
  const navigate = useNavigate()
  const { advanced, setAdvanced } = useSettings()

  if (session.isPending) {
    return <p className="p-8 text-sm text-muted">Loading…</p>
  }
  if (!session.data) return <Navigate to="/sign-in" replace />

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="mr-2 font-semibold">Dextra</span>
          <nav className="flex gap-1" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              New search
            </NavLink>
            <NavLink to="/runs" className={navClass}>
              My searches
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted" htmlFor="advanced-switch">
              Advanced options
              <Switch
                id="advanced-switch"
                label="Advanced search options"
                checked={advanced}
                onChange={setAdvanced}
              />
            </label>
            <span className="hidden text-sm text-muted sm:inline">{session.data.user.email}</span>
            <Button
              variant="ghost"
              onClick={async () => {
                await authClient.signOut()
                navigate('/sign-in', { replace: true })
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
