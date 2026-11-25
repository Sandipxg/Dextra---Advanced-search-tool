import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  buildSelectorUserMessage,
  type Engine,
  type IntakeSpec,
  needsKeywordFollowUp,
  type ProposedExclusions,
  ruleBasedSelections,
  SELECTOR_SYSTEM_PROMPT,
  type Selection,
  type SelectorOutput,
  SelectorOutputSchema,
  toSelections,
  validateSelection,
} from '@dextra/core'

/** Only the part of the SDK client we use, so tests can pass a fake. */
export interface SelectorClient {
  messages: Pick<Anthropic['messages'], 'parse'>
}

export interface SelectorOptions {
  client?: SelectorClient
  /** Defaults to Claude Opus 5.5. */
  model?: string
  /** Picking from enums is a simple task, so `low` keeps it fast and cheap. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export interface SelectorResult {
  /** `rules` when the deterministic fallback produced the selections. */
  source: 'llm' | 'rules'
  selections: Selection[]
  extraEngine: { engine: Engine; reason: string } | null
  /** Proposals only: the user confirms them before `applyExclusions`. */
  exclusions: ProposedExclusions
  followUpQuestion: string | null
  /** Why picks were dropped or why the fallback ran — shown in the summary. */
  notes: string[]
}

export const DEFAULT_MODEL = 'claude-opus-5-5'
const MAX_ATTEMPTS = 2

const rulesResult = (spec: IntakeSpec, notes: string[]): SelectorResult => ({
  source: 'rules',
  selections: ruleBasedSelections(spec),
  extraEngine: null,
  exclusions: { terms: [], sites: [] },
  followUpQuestion: null,
  notes,
})

type Attempt = { ok: true; output: SelectorOutput } | { ok: false; reason: string; retry: boolean }

const attempt = async (
  client: SelectorClient,
  spec: IntakeSpec,
  model: string,
  effort: NonNullable<SelectorOptions['effort']>,
): Promise<Attempt> => {
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      // Static rules + catalogue first, cached; the spec varies per request.
      system: [
        { type: 'text', text: SELECTOR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: buildSelectorUserMessage(spec) }],
      output_config: { format: zodOutputFormat(SelectorOutputSchema), effort },
    })
    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category ?? 'unspecified'
      return { ok: false, reason: `the model declined (${category})`, retry: false }
    }
    if (response.stop_reason === 'max_tokens') {
      return { ok: false, reason: 'the model ran out of output tokens', retry: true }
    }
    if (!response.parsed_output) {
      return { ok: false, reason: 'the model returned no usable output', retry: true }
    }
    return { ok: true, output: response.parsed_output }
  } catch (error) {
    // Most specific first; only API failures fall back — programming errors still throw.
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, reason: 'the Anthropic API key is missing or invalid', retry: false }
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: 'the Anthropic API is rate limiting requests', retry: false }
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, reason: 'the Anthropic API could not be reached', retry: false }
    }
    if (error instanceof Anthropic.APIError) {
      return {
        ok: false,
        reason: `the Anthropic API returned ${error.status ?? 'an error'}`,
        retry: false,
      }
    }
    throw error
  }
}

/**
 * Picks templates for a validated spec (D-002). The LLM only returns enum ids and values;
 * every pick is re-validated here and again by `buildPlan`. Falls back to the
 * deterministic rule-based selector when the LLM is unavailable, refuses, or returns
 * nothing usable, so a run never depends on the LLM being up.
 */
export const selectTemplates = async (
  spec: IntakeSpec,
  options: SelectorOptions = {},
): Promise<SelectorResult> => {
  // The SDK throws a plain Error (not an APIError) when it finds no credentials, so check
  // up front for the default client. Pass `client` to use other auth (e.g. an `ant` profile).
  if (!options.client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return rulesResult(spec, ['Used default picks because no Anthropic API key is configured.'])
  }
  const client = options.client ?? new Anthropic()
  const model = options.model ?? DEFAULT_MODEL
  const effort = options.effort ?? 'low'

  let result: Attempt = { ok: false, reason: 'not attempted', retry: true }
  for (let i = 0; i < MAX_ATTEMPTS && !result.ok; i++) {
    result = await attempt(client, spec, model, effort)
    if (!result.ok && !result.retry) break
  }
  if (!result.ok) return rulesResult(spec, [`Used default picks because ${result.reason}.`])

  const notes: string[] = []
  const country = spec.filters.country.value
  const selections = toSelections(result.output).filter((selection) => {
    const problems = validateSelection(selection, country)
    if (problems.length) notes.push(`Skipped ${selection.templateId}: ${problems.join('; ')}`)
    return problems.length === 0
  })
  if (selections.length === 0) {
    return rulesResult(spec, [...notes, 'Used default picks because no AI pick was valid.'])
  }

  return {
    source: 'llm',
    selections,
    extraEngine: result.output.extra_engine,
    exclusions: result.output.exclusions,
    followUpQuestion: needsKeywordFollowUp(spec) ? result.output.follow_up_question : null,
    notes,
  }
}
