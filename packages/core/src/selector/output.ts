import { z } from 'zod'
import { type Selection, SelectionSchema } from '../compiler/selection'
import { TEMPLATE_IDS } from '../templates/index'

/**
 * What the LLM returns. Shaped for structured outputs: no free-form records (params is a
 * list of name/values pairs), template ids are an enum (D-002). Sizes and per-template
 * enums are checked in code afterwards (`toSelections`, `validateSelection`).
 */
export const SelectorOutputSchema = z.object({
  selections: z.array(
    z.object({
      template_id: z.enum(TEMPLATE_IDS),
      params: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
      reason: z.string(),
    }),
  ),
  extra_engine: z.object({ engine: z.enum(['bing', 'brave']), reason: z.string() }).nullable(),
  exclusions: z.object({ terms: z.array(z.string()), sites: z.array(z.string()) }),
  follow_up_question: z.string().nullable(),
})
export type SelectorOutput = z.infer<typeof SelectorOutputSchema>

/** More picks than any budget can use are cut, keeping the LLM's order. */
export const MAX_SELECTIONS = 30

/** Converts LLM output to compiler selections; duplicate param names are merged. */
export const toSelections = (output: SelectorOutput): Selection[] =>
  output.selections.slice(0, MAX_SELECTIONS).map((s) => {
    const params: Record<string, string[]> = {}
    for (const { name, values } of s.params) {
      params[name] = [...new Set([...(params[name] ?? []), ...values])]
    }
    return SelectionSchema.parse({
      templateId: s.template_id,
      params,
      reason: s.reason.slice(0, 200),
    })
  })
