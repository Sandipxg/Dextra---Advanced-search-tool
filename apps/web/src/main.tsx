import './index.css'

const start = async () => {
  // `pnpm dev:mock` runs the whole UI against in-browser mocks (no API or database).
  // Mocks start before the app is imported: the auth client keeps the `fetch` it sees
  // when its module loads.
  if (import.meta.env.MODE === 'mock') {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }
  const root = document.getElementById('root')
  if (!root) throw new Error('#root missing')
  const { renderApp } = await import('./app')
  renderApp(root)
}

void start()
