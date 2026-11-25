import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockState, resetMockState } from '../mocks/handlers'
import { renderAt } from './render'

beforeEach(() => {
  resetMockState(true)
  mockState.runDelay = 0
})

const fillBasic = async (
  user: Awaited<ReturnType<typeof renderAt>>['user'],
  goal = 'documents',
) => {
  await user.selectOptions(await screen.findByLabelText(/^Goal/), goal)
  await user.type(screen.getByLabelText(/Describe it/), 'Annual reports and investor presentations')
  await user.type(
    screen.getByLabelText(/Target domains/),
    'https://www.Example.com/investors/{Enter}',
  )
}

describe('intake form', () => {
  it('shows the basic fields only, and more with advanced options on', async () => {
    const { user } = await renderAt('/')
    expect(await screen.findByLabelText(/^Goal/)).toBeInTheDocument()
    for (const label of [/Describe it/, /Target domains/, /Country to search from/, /Time range/]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('group', { name: 'Content types' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Search depth' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /outside my filters/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Advanced:/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/What is this for/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Advanced search options' }))
    expect(screen.getAllByRole('heading', { name: /Advanced:/ })).toHaveLength(3)
    expect(screen.getByLabelText(/What is this for/)).toBeInTheDocument()
  })

  it('shows schema errors on the right fields', async () => {
    const { user } = await renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Plan the search' }))
    expect(await screen.findByText('Choose a goal')).toBeInTheDocument()
    expect(screen.getByText('Describe what you want to find')).toBeInTheDocument()
  })

  it('cleans up domains and rejects junk', async () => {
    const { user } = await renderAt('/')
    const input = await screen.findByLabelText(/Target domains/)
    await user.type(input, 'https://www.Example.com/a/b?x=1{Enter}')
    expect(screen.getByRole('button', { name: 'Remove example.com' })).toBeInTheDocument()
    await user.type(input, 'not a domain{Enter}')
    expect(screen.getByText('"not a domain" is not a valid domain')).toBeInTheDocument()
  })

  it('asks for authorization on security goals and blocks the plan without it', async () => {
    const { user } = await renderAt('/')
    await user.selectOptions(await screen.findByLabelText(/^Goal/), 'exposed_pages')
    expect(screen.getByRole('heading', { name: 'Authorization' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Describe it/), 'Exposed config files')
    await user.click(screen.getByRole('button', { name: 'Plan the search' }))
    expect(
      await screen.findByText(/Target domains are required for security work/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Security goals need a use case/)).toBeInTheDocument()
    expect(mockState.runs.size).toBe(0)
  })
})

describe('plan → confirm → report', () => {
  it('plans, shows the summary, runs and shows grouped results', async () => {
    const { user, router } = await renderAt('/')
    await fillBasic(user)
    await user.click(screen.getByRole('button', { name: 'PDF' }))
    await user.click(screen.getByRole('button', { name: 'Plan the search' }))

    expect(await screen.findByRole('heading', { name: 'Review the plan' })).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/runs\//)
    const queries = screen.getAllByText(/^site:example\.com/)
    expect(queries.length).toBeGreaterThan(0)
    expect(screen.getByText('Default rules')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Confirm and run/ }))
    expect(
      await screen.findByRole('heading', { name: 'Search results' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    const groups = screen.getByRole('radiogroup', { name: 'Result group' })
    expect(within(groups).getByRole('radio', { name: /^Results \(\d+\)/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /doc by type/ }).length).toBeGreaterThan(0),
    )
    expect(screen.getByRole('link', { name: /CSV/ })).toHaveAttribute(
      'href',
      expect.stringContaining('format=csv'),
    )

    await user.click(within(groups).getByRole('radio', { name: /Outside scope/ }))
    expect(
      await screen.findAllByText('The search engine ignored your domain filter'),
    ).not.toHaveLength(0)
  })

  it('rates a result and clears the rating on a second click (T-011)', async () => {
    const { user } = await renderAt('/')
    await fillBasic(user)
    await user.click(screen.getByRole('button', { name: 'Plan the search' }))
    await user.click(await screen.findByRole('button', { name: /Confirm and run/ }))
    await screen.findByRole('heading', { name: 'Search results' })

    const [useful] = await screen.findAllByRole('button', { name: /^Useful:/ })
    expect(useful).toHaveAttribute('aria-pressed', 'false')
    await user.click(useful as HTMLElement)
    await waitFor(() => expect(useful).toHaveAttribute('aria-pressed', 'true'))
    expect([...mockState.feedback.values()]).toEqual(['useful'])

    await user.click(useful as HTMLElement)
    await waitFor(() => expect(useful).toHaveAttribute('aria-pressed', 'false'))
    expect(mockState.feedback.size).toBe(0)
  })

  it('plans with advanced options on (number fields keep their defaults)', async () => {
    const { user } = await renderAt('/')
    await user.click(await screen.findByRole('switch', { name: 'Advanced search options' }))
    await fillBasic(user)
    expect(screen.getByLabelText(/Minimum useful results/)).toHaveValue(15)
    await user.click(screen.getByRole('button', { name: 'Plan the search' }))
    expect(await screen.findByRole('heading', { name: 'Review the plan' })).toBeInTheDocument()
    expect([...mockState.runs.values()][0]?.spec.depth).toEqual({
      level: 'standard',
      per_query: 20,
      min_results: 15,
    })
  })

  it('lists past searches', async () => {
    const { user } = await renderAt('/')
    await fillBasic(user)
    await user.click(screen.getByRole('button', { name: 'Plan the search' }))
    await screen.findByRole('heading', { name: 'Review the plan' })
    await user.click(screen.getByRole('link', { name: 'My searches' }))
    expect(await screen.findByText('Waiting for confirmation')).toBeInTheDocument()
  })
})
