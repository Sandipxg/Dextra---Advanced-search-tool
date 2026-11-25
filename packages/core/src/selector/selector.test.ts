import { describe, expect, it } from 'vitest'
import { buildPlan } from '../compiler/compile'
import { validateSelection } from '../compiler/selection'
import { PlatformSchema } from '../schema/enums'
import { GOALS } from '../schema/goal'
import { type IntakeSpecInput, IntakeSpecSchema } from '../schema/intake-spec'
import { approvedTemplates, TEMPLATE_IDS } from '../templates/index'
import { applyExclusions } from './exclusions'
import { MAX_SELECTIONS, type SelectorOutput, toSelections } from './output'
import { buildSelectorUserMessage, SELECTOR_SYSTEM_PROMPT } from './prompt'
import { routeEngines } from './router'
import { mentions, PLATFORM_SITES, ruleBasedSelections } from './rules'

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

describe('mentions', () => {
  it('matches phrases at word starts, including plurals', () => {
    expect(mentions('annual reports and decks', 'annual report')).toBe(true)
    expect(mentions('statistics for 2026', 'statistic')).toBe(true)
    expect(mentions('metadata standards', 'data')).toBe(false)
    expect(mentions('c++ (internal)', 'internal')).toBe(true)
  })
})

describe('ruleBasedSelections: relevance (T-016)', () => {
  it('uses values the request mentions and skips opt-in templates it does not ask for', () => {
    const picks = ruleBasedSelections(
      spec({
        description: 'Annual reports and investor presentations published by Infosys',
        filters: { content: { value: ['pdf'] } },
      }),
    )
    expect(picks.map((p) => p.templateId)).toEqual(['doc_by_type', 'doc_report_kind'])
    expect(picks[1]).toMatchObject({
      params: { kind: ['annual report', 'presentation'] },
      reason: 'Matches "annual report", "presentation" in your request',
    })
  })

  it('includes an opt-in template when the request asks for it', () => {
    const picks = ruleBasedSelections(
      spec({ description: 'Documents marked internal use only that leaked onto the site' }),
    )
    const label = picks.find((p) => p.templateId === 'doc_sensitive_label')
    expect(label?.params.label).toEqual(['internal use only'])
  })

  it('opts in from keywords as well as the description', () => {
    const picks = ruleBasedSelections(spec({ keywords: { all: ['dataset'] } }))
    expect(picks.map((p) => p.templateId)).toContain('doc_data_files')
  })
})

describe('platforms and media (D-027)', () => {
  it('maps every platform to a template a normal search can use', () => {
    const normalSites = new Set(
      approvedTemplates()
        .filter((t) => t.sensitivity === 'normal')
        .flatMap((t) => t.params.platform ?? []),
    )
    for (const platform of PlatformSchema.options) {
      const sites = PLATFORM_SITES[platform]
      expect(sites.length, platform).toBeGreaterThan(0)
      expect(
        sites.some((site) => normalSites.has(site)),
        platform,
      ).toBe(true)
    }
  })

  it('searches GitHub by name in a normal run (was security-only before)', () => {
    const picks = ruleBasedSelections(
      spec({
        goal: 'third_party_mentions',
        scope: { domains: [] },
        keywords: { all: ['Infosys'] },
        sources: { platforms: { value: ['github', 'bitbucket'] } },
      }),
    )
    expect(picks.find((p) => p.templateId === 'tp_code_hosting')?.params.platform).toEqual([
      'github.com',
      'bitbucket.org',
    ])
    expect(picks.map((p) => p.templateId)).not.toContain('tp_code_mentions')
  })

  it('picks raw media files only when the request asks for files', () => {
    const files = ruleBasedSelections(spec({ description: 'Download the mp3 recordings' }))
    expect(files.map((p) => p.templateId)).toContain('doc_media_files')
    const plain = ruleBasedSelections(spec({ filters: { content: { value: ['pdf'] } } }))
    expect(plain.map((p) => p.templateId)).not.toContain('doc_media_files')
  })
})

describe('media searches (D-028)', () => {
  const ids = (input: Partial<IntakeSpecInput>) =>
    ruleBasedSelections(spec(input)).map((p) => p.templateId)

  it('searches video sites and plain web pages for a Video tick (reported case)', () => {
    const s = spec({
      scope: { domains: [] },
      keywords: { all: ['shiddat', 'movie'] },
      filters: { content: { value: ['video'] } },
    })
    const picks = ruleBasedSelections(s)
    expect(picks.map((p) => p.templateId)).toEqual(['doc_video_pages', 'gr_keywords'])
    const plan = buildPlan(s, picks)
    expect(plan.queries.every((q) => q.type === 'web')).toBe(true)
    expect(plan.queries.map((q) => q.q)).toEqual([
      '(site:youtube.com OR site:vimeo.com OR site:dailymotion.com OR site:facebook.com OR site:hotstar.com OR site:netflix.com OR site:primevideo.com OR site:archive.org) shiddat movie',
      'shiddat movie',
    ])
  })

  it('uses image and audio sites for their ticks, each with a plain web search', () => {
    expect(
      ids({ filters: { content: { value: ['image'] } }, keywords: { all: ['logo'] } }),
    ).toEqual(['doc_image_pages', 'gr_keywords'])
    const audio = ruleBasedSelections(
      spec({ filters: { content: { value: ['audio'] } }, keywords: { all: ['shiddat'] } }),
    )
    expect(audio.map((p) => p.templateId)).toEqual(['doc_audio_sites', 'gr_keywords'])
    expect(audio[0]?.params.platform).toContain('open.spotify.com')
  })

  it('adds media searches for other goals without a filetype: layer for media', () => {
    const s = spec({
      goal: 'general_research',
      scope: { domains: [] },
      keywords: { all: ['shiddat', 'movie'] },
      filters: { content: { value: ['video'] } },
    })
    const picked = ruleBasedSelections(s).map((p) => p.templateId)
    expect(picked).toContain('doc_video_pages')
    expect(picked.filter((id) => id === 'gr_keywords')).toHaveLength(1)
    expect(picked).not.toContain('gr_keywords_filetype')
    const plan = buildPlan(s, ruleBasedSelections(s))
    expect(plan.queries.some((q) => /filetype:/.test(q.q))).toBe(false)
  })

  it('opts in from media words and stays out of plain document searches', () => {
    expect(ids({ keywords: { all: ['shiddat', 'trailer'] } })).toContain('doc_video_pages')
    const pdf = ids({ filters: { content: { value: ['pdf'] } } })
    expect(pdf).toContain('doc_by_type')
    for (const id of ['doc_video_pages', 'doc_image_pages', 'doc_audio_sites', 'gr_keywords']) {
      expect(pdf).not.toContain(id)
    }
  })
})

describe('ruleBasedSelections: opt-in flavour templates (T-023)', () => {
  const ids = (input: Partial<IntakeSpecInput>) =>
    ruleBasedSelections(spec(input)).map((p) => p.templateId)

  it('keeps academic and trusted-domain templates out unless the request signals them', () => {
    const plain = ids({
      goal: 'general_research',
      scope: { domains: [] },
      description: 'the film shiddat',
      keywords: { all: ['shiddat', 'movie'] },
    })
    expect(plain).toContain('gr_keywords')
    expect(plain).not.toContain('gr_academic')
    expect(plain).not.toContain('gr_trusted_domains')

    const research = ids({
      goal: 'general_research',
      scope: { domains: [] },
      description: 'peer-reviewed research papers on solar',
      keywords: { all: ['solar'] },
    })
    expect(research).toContain('gr_academic')
  })

  it('skips doc_by_type unless keywords or a target domain anchor it', () => {
    expect(ids({ goal: 'documents', scope: { domains: [] }, description: 'files' })).not.toContain(
      'doc_by_type',
    )
    expect(
      ids({ goal: 'documents', scope: { domains: ['target.com'] }, description: 'files' }),
    ).toContain('doc_by_type')
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
    expect(normal.map((p) => p.templateId)).toEqual([
      'tp_public_docs',
      'tp_forums',
      'tp_code_hosting',
      'tp_social',
    ])
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
