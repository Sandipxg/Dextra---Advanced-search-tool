import { z } from 'zod'
import type { Goal } from '../schema/goal'
import type { CountryCode } from '../schema/iso-codes'
import { TEMPLATE_DATA, TEMPLATE_IDS } from './library.generated'
import { type Template, TemplateLibrarySchema } from './schema'

export * from './schema'
export { TEMPLATE_IDS }

/** Template ids as an enum — the only ids the selector's output may contain (D-002). */
export const TemplateIdSchema = z.enum(TEMPLATE_IDS)
export type TemplateId = z.infer<typeof TemplateIdSchema>

/** All templates, validated once at load. */
export const TEMPLATES: readonly Template[] = TemplateLibrarySchema.parse(TEMPLATE_DATA)

const byId = new Map(TEMPLATES.map((t) => [t.id, t]))

export const getTemplate = (id: TemplateId): Template => {
  const template = byId.get(id)
  if (!template) throw new Error(`Unknown template ${id}`)
  return template
}

export const approvedTemplates = (): Template[] => TEMPLATES.filter((t) => t.status === 'approved')

export const templatesForGoal = (goal: Goal): Template[] =>
  approvedTemplates().filter((t) => t.goal === goal)

/**
 * Param values offered to the LLM for this request: values tagged `regional` are kept only
 * when the spec's country matches (D-011).
 */
export const paramValuesFor = (
  template: Template,
  country: CountryCode | null,
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(template.params).map(([key, values]) => [
      key,
      values.filter((v) => {
        const countries = template.regional?.[v]
        return !countries || (country !== null && (countries as string[]).includes(country))
      }),
    ]),
  )
