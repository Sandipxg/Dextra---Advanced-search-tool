import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { useSettings } from '../lib/settings'
import { server } from './server'

// First render loads the routes lazily (see render.tsx), which can take over a second.
configure({ asyncUtilTimeout: 5000 })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
  useSettings.setState({ advanced: false })
})
afterAll(() => server.close())
