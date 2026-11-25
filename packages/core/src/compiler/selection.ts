import { z } from 'zod'
import type { CountryCode } from '../schema/iso-codes'
import { getTemplate, paramValuesFor, type TemplateId, TemplateIdSchema } from '../templates/index'

/**
 * One template choice: what the selector (LLM or rules) returns per template (D-002).
 * The LLM output schema in Phase 6 wraps a list of these.
 */
export const SelectionSchema = z.strictObject({
  templateId: TemplateIdSchema,
  params: z.record(z.string(), z.array(z.string()).min(1)).default({}),
  reason: z.string().trim().max(200).default(''),
})
export type Selection = z.output<typeof SelectionSchema>

/**
 * Checks picked params against the template: every param present, values from its enum
 * (after the regional filter, D-011), 1..max_pick values, no unknown params.
 * Returns problems; empty means valid.
 */
export const validateSelection = (selection: Selection, country: CountryCode | null): string[] => {
  const template = getTemplate(selection.templateId)
  const allowed = paramValuesFor(template, country)
  const problems: string[] = []

  for (const key of Object.keys(selection.params)) {
    if (!(key in allowed)) problems.push(`unknown param ${key}`)
  }
  for (const [key, values] of Object.entries(allowed)) {
    const picked = selection.params[key]
    if (!picked?.length) {
      problems.push(`missing param ${key}`)
      continue
    }
    if (picked.length > template.max_pick) {
      problems.push(`${key}: picked ${picked.length}, max ${template.max_pick}`)
    }
    if (new Set(picked).size !== picked.length) problems.push(`${key}: duplicate values`)
    for (const v of picked) {
      if (!values.includes(v)) problems.push(`${key}: "${v.slice(0, 60)}" is not allowed`)
    }
  }
  return problems
}

export type { TemplateId }
