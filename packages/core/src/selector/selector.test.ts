import { describe, expect, it } from 'vitest'
import { buildPlan } from '../compiler/compile'
import { validateSelection } from '../compiler/selection'
import { GOALS } from '../schema/goal'
import { type IntakeSpecInput, IntakeSpecSchema } from '../schema/intake-spec'
import { TEMPLATE_IDS } from '../templates/index'
import { applyExclusions } from './exclusions'
import { MAX_SELECTIONS, type SelectorOutput, toSelections } from './output'
import { buildSelectorUserMessage, SELECTOR_SYSTEM_PROMPT } from './prompt'
import { routeEngines } from './router'
import { ruleBasedSelections } from './rules'

const spec = (input: Partial<IntakeSpecInput> = {}) =>
  IntakeSpecSchema.parse({
    goal: 'documents',
    description: 'Public PDFs',
    scope: { domains: ['target.com'] },
    ...input,
  })

const security = {
  goal: 'exposed_pages',
  description: 'Exposed files',
  use_case: 'bug_bounty',
  scope: { domains: ['target.com'] },
  authorization: { confirmed: true, link: 'https://hackerone.com/target' },
} satisfies Partial<IntakeSpecInput>

describe('toSelections', () => {
  const output = (selections: SelectorOutput['selections']): SelectorOutput => ({
    selections,
    extra_engine: null,
    exclusions: { terms: [], sites: [] },
    follow_up_question: null,
  })

  it('turns name/values pairs into params, merging duplicates', () => {
    const [selection] = toSelections(
      output([
        {
          template_id: 'doc_by_type',
          params: [
            { name: 'ext', values: ['pdf'] },
            { name: 'ext', values: ['pdf', 'docx'] },
          ],
          reason: 'Docs',
        },
      ]),
    )
    expect(selection).toEqual({
      templateId: 'doc_by_type',
      params: { ext: ['pdf', 'docx'] },
      reason: 'Docs',
    })
  })

  it(`keeps at most ${MAX_SELECTIONS} picks`, () => {
    const many = Array.from({ length: 40 }, () => ({
      template_id: 'doc_by_type' as const,
      params: [{ name: 'ext', values: ['pdf'] }],
      reason: '',
    }))
    expect(toSelections(output(many))).toHaveLength(MAX_SELECTIONS)
  })
})

describe('prompt', () => {
  it('puts the whole catalogue in a static system prompt', () => {
    for (const id of TEMPLATE_IDS) expect(SELECTOR_SYSTEM_PROMPT).toContain(`"id":"${id}"`)
    expect(SELECTOR_SYSTEM_PROMPT).not.toContain('target.com')
  })

  it('puts the spec and run facts in the user message', () => {
    const message = buildSelectorUserMessage(spec({ filters: { country: { value: 'in' } } }))
    expect(message).toContain('"domains": [\n      "target.com"\n    ]')
    expect(message).toContain('Query budget: 30 queries.')
    expect(message).toContain('Security run: no.')
    expect(message).toContain('Country: in.')
    expect(buildSelectorUserMessage(spec(security))).toContain('Security run: yes.')
    expect(
      buildSelectorUserMessage(spec({ goal: 'general_research', scope: { domains: [] } })),
    ).toContain('Keywords missing: yes.')
  })
})

describe('ruleBasedSelections', () => {
  it('follows the content filter for file extensions', () => {
    const picks = ruleBasedSelections(spec({ filters: { content: { value: ['presentation'] } } }))
    expect(picks.find((p) => p.templateId === 'doc_by_type')?.params.ext).toEqual(['ppt', 'pptx'])
    // doc_data_files only offers csv/json/xlsx/xml/tsv, so it can't serve presentations.
    expect(picks.map((p) => p.templateId)).not.toContain('doc_data_files')
  })

  it('keeps security templates out of non-security runs', () => {
    const mentions = { scope: { domains: ['target.com'], names: ['Target Corp'] } }
    const normal = ruleBasedSelections(spec({ goal: 'third_party_mentions', ...mentions }))
    expect(normal.map((p) => p.templateId)).toEqual(['tp_public_docs', 'tp_forums', 'tp_social'])
    const authorized = ruleBasedSelections(
      spec({ ...security, goal: 'third_party_mentions', ...mentions }),
    )
    expect(authorized.map((p) => p.templateId)).toContain('tp_code_mentions')
    const picks = ruleBasedSelections(spec(security))
    expect(picks.map((p) => p.templateId)).toContain('exp_config_files')
  })

  it('skips templates whose needs the spec can’t supply', () => {
    const ids = ruleBasedSelections(spec({ goal: 'competitor_research' })).map((p) => p.templateId)
    expect(ids).toContain('mk_pricing_pages')
    expect(ids).not.toContain('mk_comparisons') // needs names
  })

  it('adds platform templates for E3 platforms', () => {
    const picks = ruleBasedSelections(
      spec({
        scope: { domains: ['target.com'], names: ['Target Corp'] },
        sources: { platforms: { value: ['reddit'] } },
      }),
    )
    expect(picks.find((p) => p.templateId === 'tp_forums')?.params.platform).toEqual(['reddit.com'])
  })

  it.each(GOALS)('produces valid, compilable picks for %s', (goal) => {
    const s = spec({
      ...security,
      goal,
      scope: { domains: ['target.com'], names: ['Target Corp'] },
      keywords: { all: ['report'] },
      filters: { country: { value: 'in' } },
    })
    const picks = ruleBasedSelections(s)
    expect(picks.length).toBeGreaterThan(0)
    for (const p of picks) expect(validateSelection(p, 'in'), p.templateId).toEqual([])
    const plan = buildPlan(s, picks)
    expect(plan.rejected).toEqual([])
    expect(plan.dropped.filter((d) => !/budget/.test(d.reason))).toEqual([])
  })
})

describe('routeEngines (D-004)', () => {
  it('uses Google by default and explains why', () => {
    expect(routeEngines(spec())).toEqual({
      engines: ['google'],
      notes: ['Google: default engine, supports every template operator'],
    })
  })

  it('records an engine suggestion it can’t use yet (D-015)', () => {
    const route = routeEngines(spec(), { engine: 'bing', reason: 'older PDFs' })
    expect(route.engines).toEqual(['google'])
    expect(route.notes[1]).toBe("Bing was suggested (older PDFs) but isn't available yet")
  })

  it('lets advanced settings override', () => {
    expect(routeEngines(spec({ sources: { engines: ['google'] } })).notes).toEqual([
      'Google: chosen in advanced settings',
    ])
  })
})

describe('applyExclusions', () => {
  it('adds confirmed terms and domains, skipping targets and junk', () => {
    const { spec: next, skipped } = applyExclusions(spec(), {
      terms: ['careers'],
      sites: ['https://Pinterest.com/', 'target.com', 'not a domain'],
    })
    expect(next.keywords.exclude).toEqual(['careers'])
    expect(next.scope.exclude_domains).toEqual(['pinterest.com'])
    expect(skipped).toEqual(['target.com', 'not a domain'])
  })
})
