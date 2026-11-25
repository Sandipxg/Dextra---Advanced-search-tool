import type { Selection } from '../compiler/selection'
import { CONTENT_TYPE_EXTENSIONS } from '../schema/content-types'
import type { IntakeSpec } from '../schema/intake-spec'
import { isSecurityRun } from '../schema/intake-spec'
import {
  approvedTemplates,
  paramValuesFor,
  type Template,
  type TemplateId,
  templatesForGoal,
} from '../templates/index'

/** E3 platforms → template platform values. */
export const PLATFORM_SITES: Record<IntakeSpec['sources']['platforms']['value'][number], string[]> =
  {
    github: ['github.com'],
    gitlab: ['gitlab.com'],
    stackoverflow: ['stackoverflow.com'],
    linkedin: ['linkedin.com', 'linkedin.com/company', 'linkedin.com/jobs'],
    reddit: ['reddit.com'],
    x: ['x.com'],
    public_docs: [
      'docs.google.com',
      'drive.google.com',
      'notion.site',
      'trello.com',
      'airtable.com',
    ],
    slideshare_scribd: ['slideshare.net', 'scribd.com'],
  }

const DEFAULT_PICKS = 2

const pickParams = (
  t: Template,
  spec: IntakeSpec,
  sites: Set<string>,
): Record<string, string[]> | null => {
  const contentExts = new Set(spec.filters.content.value.flatMap((c) => CONTENT_TYPE_EXTENSIONS[c]))
  const params: Record<string, string[]> = {}
  for (const [key, allowed] of Object.entries(paramValuesFor(t, spec.filters.country.value))) {
    let values = allowed
    if (key === 'ext' && contentExts.size && t.goal === 'documents') {
      // A document template that can't produce the requested content types is skipped.
      values = allowed.filter((v) => contentExts.has(v))
    }
    if (key === 'platform' && sites.size) {
      const wanted = allowed.filter((v) => sites.has(v))
      if (wanted.length) values = wanted
    }
    const picked = values.slice(
      0,
      key === 'platform' || key === 'ext' ? t.max_pick : Math.min(t.max_pick, DEFAULT_PICKS),
    )
    if (picked.length === 0) return null
    params[key] = picked
  }
  return params
}

const canSupply = (t: Template, spec: IntakeSpec): boolean => {
  if (t.vars.includes('name') && spec.scope.names.length === 0) return false
  const needsDomains =
    t.vars.includes('domain') || ['required', 'subdomains'].includes(t.scope_mode)
  if (needsDomains && spec.scope.domains.length === 0) return false
  const hasKeywords =
    spec.keywords.all.length + spec.keywords.phrases.length + spec.keywords.any.length > 0
  return !(t.vars.includes('keywords') && !hasKeywords)
}

/**
 * Deterministic selector: used when the LLM is unavailable, refuses, or returns nothing
 * usable, and in tests/CI. Goal templates by priority, plus platform templates for E3.
 */
export const ruleBasedSelections = (spec: IntakeSpec): Selection[] => {
  const security = isSecurityRun(spec)
  const sites = new Set(spec.sources.platforms.value.flatMap((p) => PLATFORM_SITES[p]))
  const allowed = (t: Template) => (security || t.sensitivity !== 'security') && canSupply(t, spec)

  const goal = templatesForGoal(spec.goal)
    .filter(allowed)
    .sort((a, b) => a.priority - b.priority)
  const platform = sites.size
    ? approvedTemplates().filter(
        (t) =>
          t.goal !== spec.goal &&
          t.scope_mode === 'platform' &&
          allowed(t) &&
          (t.params.platform ?? []).some((v) => sites.has(v)),
      )
    : []

  return [...goal, ...platform].flatMap((t) => {
    const params = pickParams(t, spec, sites)
    return params
      ? [{ templateId: t.id as TemplateId, params, reason: 'Default pick for this goal' }]
      : []
  })
}
