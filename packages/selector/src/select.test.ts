import Anthropic from '@anthropic-ai/sdk'
import { IntakeSpecSchema, SELECTOR_SYSTEM_PROMPT, type SelectorOutput } from '@dextra/core'
import { describe, expect, it, vi } from 'vitest'
import { type SelectorClient, selectTemplates } from './select'

const spec = IntakeSpecSchema.parse({
  goal: 'documents',
  description: 'Public PDFs from target.com',
  scope: { domains: ['target.com'] },
})

const output = (patch: Partial<SelectorOutput> = {}): SelectorOutput => ({
  selections: [
    {
      template_id: 'doc_by_type',
      params: [{ name: 'ext', values: ['pdf'] }],
      reason: 'PDFs on the site',
    },
  ],
  extra_engine: null,
  exclusions: { terms: ['careers'], sites: [] },
  follow_up_question: 'Which keywords?',
  ...patch,
})

/** Fake client: each call returns the next response (or throws it). */
const fakeClient = (...responses: unknown[]) => {
  const parse = vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  })
  return { client: { messages: { parse } } as unknown as SelectorClient, parse }
}

const ok = (
  parsed: SelectorOutput | null,
  stop_reason = 'end_turn',
  stop_details: unknown = null,
) => ({
  stop_reason,
  stop_details,
  parsed_output: parsed,
})

describe('selectTemplates', () => {
  it('sends the cached system prompt, the spec, the default model and low effort', async () => {
    const { client, parse } = fakeClient(ok(output()))
    await selectTemplates(spec, { client })
    const request = parse.mock.calls[0]?.[0 as never] as unknown as Record<string, unknown>
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      system: [
        { type: 'text', text: SELECTOR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      output_config: { effort: 'low' },
    })
    expect(JSON.stringify(request.messages)).toContain('target.com')
  })

  it('returns valid LLM picks and drops invalid ones with a note', async () => {
    const { client } = fakeClient(
      ok(
        output({
          selections: [
            {
              template_id: 'doc_by_type',
              params: [{ name: 'ext', values: ['pdf'] }],
              reason: 'PDFs',
            },
            {
              template_id: 'doc_by_type',
              params: [{ name: 'ext', values: ['exe'] }],
              reason: 'bad',
            },
          ],
        }),
      ),
    )
    const result = await selectTemplates(spec, { client })
    expect(result.source).toBe('llm')
    expect(result.selections).toEqual([
      { templateId: 'doc_by_type', params: { ext: ['pdf'] }, reason: 'PDFs' },
    ])
    expect(result.notes).toEqual(['Skipped doc_by_type: ext: "exe" is not allowed'])
    expect(result.exclusions).toEqual({ terms: ['careers'], sites: [] })
  })

  it('only passes a follow-up question on when keywords are missing', async () => {
    expect(
      (await selectTemplates(spec, { client: fakeClient(ok(output())).client })).followUpQuestion,
    ).toBeNull()
    const general = IntakeSpecSchema.parse({ goal: 'general_research', description: 'solar' })
    const result = await selectTemplates(general, {
      client: fakeClient(ok(output({ selections: [] }))).client,
    })
    // No valid picks → rules, which never ask questions.
    expect(result.source).toBe('rules')
  })

  it('falls back to rules without retrying when the model declines', async () => {
    const { client, parse } = fakeClient(ok(null, 'refusal', { category: 'cyber' }))
    const result = await selectTemplates(spec, { client })
    expect(parse).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('rules')
    expect(result.notes).toEqual(['Used default picks because the model declined (cyber).'])
    expect(result.selections.length).toBeGreaterThan(0)
  })

  it('retries once on unusable output, then falls back', async () => {
    const { client, parse } = fakeClient(ok(null), ok(null, 'max_tokens'))
    const result = await selectTemplates(spec, { client })
    expect(parse).toHaveBeenCalledTimes(2)
    expect(result.notes).toEqual(['Used default picks because the model ran out of output tokens.'])
  })

  it('succeeds on the retry', async () => {
    const { client } = fakeClient(ok(null), ok(output()))
    expect((await selectTemplates(spec, { client })).source).toBe('llm')
  })

  it.each([
    [
      new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers()),
      'the Anthropic API key is missing or invalid',
    ],
    [
      new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()),
      'the Anthropic API is rate limiting requests',
    ],
    [
      new Anthropic.APIConnectionError({ message: 'offline' }),
      'the Anthropic API could not be reached',
    ],
    [
      new Anthropic.InternalServerError(500, undefined, 'oops', new Headers()),
      'the Anthropic API returned 500',
    ],
  ])('falls back on API errors: %s', async (error, reason) => {
    const { client, parse } = fakeClient(error)
    const result = await selectTemplates(spec, { client })
    expect(parse).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      source: 'rules',
      notes: [`Used default picks because ${reason}.`],
    })
  })

  it('uses rules without calling the API when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    try {
      const result = await selectTemplates(spec)
      expect(result).toMatchObject({
        source: 'rules',
        notes: ['Used default picks because no Anthropic API key is configured.'],
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not hide programming errors', async () => {
    const { client } = fakeClient(new TypeError('bug'))
    await expect(selectTemplates(spec, { client })).rejects.toThrow('bug')
  })
})
