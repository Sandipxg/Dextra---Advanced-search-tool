import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

/**
 * Renders the real routes at `path`. Routes are imported lazily, after MSW is listening,
 * because the auth client keeps the `fetch` it sees when its module loads.
 */
export const renderAt = async (path: string) => {
  const { routes } = await import('../routes')
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...utils, user, router }
}
