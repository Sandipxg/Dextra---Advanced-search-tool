import { baseHost } from '../compiler/tokens'
import { normalizeDomain } from '../schema/fields'
import { type IntakeSpec, IntakeSpecSchema } from '../schema/intake-spec'

export interface ProposedExclusions {
  terms: string[]
  sites: string[]
}

/**
 * Applies exclusions the user confirmed in the pre-run summary (A5 → keywords.exclude and
 * scope.exclude_domains). Never applied automatically from LLM output. Sites that aren't
 * valid domains, or that are target domains, are skipped and reported.
 */
export const applyExclusions = (
  spec: IntakeSpec,
  confirmed: ProposedExclusions,
): { spec: IntakeSpec; skipped: string[] } => {
  const targets = new Set(spec.scope.domains.map(baseHost))
  const skipped: string[] = []
  const sites = confirmed.sites.flatMap((raw) => {
    const domain = normalizeDomain(raw)
    if (!domain || targets.has(baseHost(domain))) {
      skipped.push(raw)
      return []
    }
    return [domain]
  })
  const next = IntakeSpecSchema.parse({
    ...spec,
    scope: { ...spec.scope, exclude_domains: [...spec.scope.exclude_domains, ...sites] },
    keywords: { ...spec.keywords, exclude: [...spec.keywords.exclude, ...confirmed.terms] },
  })
  return { spec: next, skipped }
}
