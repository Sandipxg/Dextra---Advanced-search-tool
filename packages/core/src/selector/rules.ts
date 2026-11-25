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
    linkedin: ['linkedin.com', 'linkedin.com/company', 'linkedin.com/jobs'],
    x: ['x.com'],
    facebook: ['facebook.com'],
    instagram: ['instagram.com'],
    youtube: ['youtube.com'],
    tiktok: ['tiktok.com'],
    pinterest: ['pinterest.com'],
    reddit: ['reddit.com'],
    stackoverflow: ['stackoverflow.com'],
    quora: ['quora.com'],
    hacker_news: ['news.ycombinator.com'],
    medium: ['medium.com'],
    substack: ['substack.com'],
    dev_to: ['dev.to'],
    github: ['github.com'],
    gitlab: ['gitlab.com'],
    bitbucket: ['bitbucket.org'],
    public_docs: [
      'docs.google.com',
      'drive.google.com',
      'notion.site',
      'trello.com',
      'airtable.com',
    ],
    slideshare_scribd: ['slideshare.net', 'scribd.com'],
    crunchbase: ['crunchbase.com'],
    glassdoor: ['glassdoor.com'],
    g2: ['g2.com'],
    capterra: ['capterra.com'],
    trustpilot: ['trustpilot.com'],
    product_hunt: ['producthunt.com'],
  }

const DEFAULT_PICKS = 2

/**
 * Templates whose signal only fits specific requests. The rule selector picks them only
 * when the request mentions one of these words (T-016); the LLM decides on its own.
 */
export const OPT_IN_WORDS: Partial<Record<TemplateId, readonly string[]>> = {
  doc_sensitive_label: [
    'confidential',
    'internal',
    'sensitive',
    'restricted',
    'proprietary',
    'not for distribution',
    'draft',
    'leak',
  ],
  doc_data_files: ['data', 'dataset', 'csv', 'json', 'spreadsheet', 'excel', 'statistic', 'xml'],
  tech_stack_in_jobs: ['job', 'hiring', 'career', 'vacanc', 'recruit'],
  doc_media_files: [
    'image',
    'photo',
    'picture',
    'logo',
    'video',
    'audio',
    'music',
    'song',
    'podcast',
    'recording',
    'media',
  ],
}

/** Opt-in templates that exist for a file type: a matching content-type tick opts them in. */
const OPT_IN_BY_CONTENT: ReadonlySet<TemplateId> = new Set<TemplateId>([
  'doc_data_files',
  'doc_media_files',
])

/** Everything the user wrote about what they want, lowercased. */
const requestText = (spec: IntakeSpec): string =>
  [
    spec.description,
    spec.perfect_result.text,
    ...spec.keywords.all,
    ...spec.keywords.any,
    ...spec.keywords.phrases,
    spec.notes,
  ]
    .join(' ')
    .toLowerCase()

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text mentions `phrase` starting at a word boundary (so "report" matches "reports"). */
export const mentions = (text: string, phrase: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase.toLowerCase())}`).test(text)

interface Picked {
  params: Record<string, string[]>
  /** Param values chosen because the request mentions them. */
  matched: string[]
}

const pickParams = (
  t: Template,
  spec: IntakeSpec,
  sites: Set<string>,
  text: string,
): Picked | null => {
  const contentExts = new Set(spec.filters.content.value.flatMap((c) => CONTENT_TYPE_EXTENSIONS[c]))
  const params: Record<string, string[]> = {}
  const matched: string[] = []
  for (const [key, allowed] of Object.entries(paramValuesFor(t, spec.filters.country.value))) {
    let values = allowed
    if (key === 'ext') {
      if (contentExts.size && t.goal === 'documents') {
        // A document template that can't produce the requested content types is skipped.
        values = allowed.filter((v) => contentExts.has(v))
      }
    } else if (key === 'platform') {
      const wanted = allowed.filter((v) => sites.has(v))
      if (wanted.length) values = wanted
    } else {
      // Prefer values the user actually wrote, e.g. "annual report" in the description.
      const wanted = allowed.filter((v) => mentions(text, v))
      if (wanted.length) {
        values = wanted
        matched.push(...wanted.slice(0, t.max_pick))
      }
    }
    const picked = values.slice(
      0,
      key === 'platform' || key === 'ext' ? t.max_pick : Math.min(t.max_pick, DEFAULT_PICKS),
    )
    if (picked.length === 0) return null
    params[key] = picked
  }
  return { params, matched }
}

const canSupply = (t: Template, spec: IntakeSpec): boolean => {
  const nameSources =
    spec.scope.names.length + spec.keywords.all.length + spec.keywords.phrases.length
  if (t.vars.includes('name') && nameSources === 0) return false
  const needsDomains =
    t.vars.includes('domain') || ['required', 'subdomains'].includes(t.scope_mode)
  if (needsDomains && spec.scope.domains.length === 0) return false
  const hasKeywords =
    spec.keywords.all.length + spec.keywords.phrases.length + spec.keywords.any.length > 0
  return !(t.vars.includes('keywords') && !hasKeywords)
}

/**
 * Deterministic selector: used when the LLM is unavailable, refuses, or returns nothing
 * usable, and in tests/CI. Goal templates by priority (opt-in ones only when the request
 * mentions them), plus platform templates for E3. Param values the request mentions win
 * over the defaults.
 */
export const ruleBasedSelections = (spec: IntakeSpec): Selection[] => {
  const security = isSecurityRun(spec)
  const text = requestText(spec)
  const sites = new Set(spec.sources.platforms.value.flatMap((p) => PLATFORM_SITES[p]))
  const contentExts = new Set(spec.filters.content.value.flatMap((c) => CONTENT_TYPE_EXTENSIONS[c]))
  // Opt-in templates run when the request mentions them; file-type templates also run when
  // a ticked content type matches their file types (e.g. Audio → doc_media_files).
  const optedIn = (t: Template) => {
    const words = OPT_IN_WORDS[t.id as TemplateId]
    if (!words) return true
    if (words.some((w) => mentions(text, w))) return true
    return (
      OPT_IN_BY_CONTENT.has(t.id as TemplateId) &&
      (t.params.ext ?? []).some((e) => contentExts.has(e))
    )
  }
  const allowed = (t: Template) =>
    (security || t.sensitivity !== 'security') && canSupply(t, spec) && optedIn(t)

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
    const picked = pickParams(t, spec, sites, text)
    if (!picked) return []
    const reason = picked.matched.length
      ? `Matches "${picked.matched.join('", "')}" in your request`
      : 'Default pick for this goal'
    return [{ templateId: t.id as TemplateId, params: picked.params, reason }]
  })
}
