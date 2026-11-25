import { getResponse, type RequestHandler } from 'msw'
import { setupWorker } from 'msw/browser'
import { handlers, mockState, resetMockState } from './handlers'

// Demo mode: any email/password signs in; the fake user survives page reloads in this tab.
const KEY = 'dextra-demo-user'
resetMockState(false)
try {
  const saved = sessionStorage.getItem(KEY)
  if (saved) mockState.user = JSON.parse(saved) as typeof mockState.user
} catch {
  // storage unavailable: stay signed out
}
mockState.onUserChange = (user) => {
  try {
    if (user) sessionStorage.setItem(KEY, JSON.stringify(user))
    else sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/**
 * Starts demo mode. Uses the MSW service worker when the browser allows one; some embedded
 * browsers refuse service workers, so it falls back to routing `fetch` through the same
 * handlers (enough for this app, which only uses fetch).
 */
export const startMocks = async () => {
  try {
    await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass', quiet: true })
    return
  } catch {
    // fall through to the fetch patch
  }
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    const mocked = await getResponse(handlers as RequestHandler[], request)
    return mocked ?? realFetch(input, init)
  }
}
