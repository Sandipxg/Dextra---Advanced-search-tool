import { createAuthClient } from 'better-auth/react'

/** Better Auth client. The API is on the same origin (Vite proxy in dev). */
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
})
