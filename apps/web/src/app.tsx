import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { routes } from './routes'

export const renderApp = (root: HTMLElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={createBrowserRouter(routes)} />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </StrictMode>,
  )
}
