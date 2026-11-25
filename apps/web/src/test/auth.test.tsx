import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { resetMockState } from '../mocks/handlers'
import { renderAt } from './render'

// Own file: the auth client caches the session per module instance.
it('sends signed-out users to the sign-in page', async () => {
  resetMockState(false)
  await renderAt('/')
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
})
