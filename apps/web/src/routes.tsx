import type { RouteObject } from 'react-router'
import { AuthPage } from './features/auth/AuthPage'
import { IntakePage } from './features/intake/IntakePage'
import { AppShell } from './features/layout/AppShell'
import { RunPage } from './features/runs/RunPage'
import { RunsPage } from './features/runs/RunsPage'

export const routes: RouteObject[] = [
  { path: '/sign-in', element: <AuthPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <IntakePage /> },
      { path: 'runs', element: <RunsPage /> },
      { path: 'runs/:id', element: <RunPage /> },
    ],
  },
]
