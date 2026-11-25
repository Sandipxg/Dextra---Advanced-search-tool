import { describe, expect, it } from 'vitest'
import { buildPlan } from '../compiler/compile'
import type { Selection } from '../compiler/selection'
import { IntakeSpecSchema } from '../schema/intake-spec'
import { buildSelectorUserMessage } from '../selector/prompt'
import type { TemplateId } from '../templates/index'
import {
  feedbackDelta,
  formatTrackRecord,
  outsideScopeVerdict,
  priorityBoosts,
  reviewSuggestions,
  summarizeStats,
  type TemplateStatRow,
} from './index'

const row = (templateId: string, patch: Partial<TemplateStatRow> = {}): TemplateStatRow => ({
  templateId,
  engine: 'google',
  goal: 'documents',
  queries: 0,
  results: 0,
  inScope: 0,
  useful: 0,
  notUseful: 0,
  ...patch,
})

describe('summarizeStats', () => {
  it('adds up engines per template and smooths the useful rate', () => {
    const [r] = summarizeStats([
      row('doc_by_type', { queries: 2, results: 20, inScope: 18, useful: 3 }),
      row('doc_by_type', {
        engine: 'bing',
        queries: 1,
        results: 10,
        inScope: 6,
        useful: 1,
        notUseful: 2,
      }),
    ])
    expect(r).toEqual({
      templateId: 'doc_by_type',
      queries: 3,
      results: 30,
      votes: 6,
      usefulRate: 5 / 8,
      scopeRate: 24 / 30,
    })
  })

  it('starts unrated templates at 50% and has no scope rate without results', () => {
    expect(summarizeStats([row('x')])[0]).toMatchObject({
      usefulRate: 0.5,
      scopeRate: null,
      votes: 0,
    })
  })
})

describe('priorityBoosts', () => {
  it('needs enough ratings before nudging', () => {
    expect(priorityBoosts(summarizeStats([row('a', { useful: 4 })]))).toEqual({})
    expect(priorityBoosts(summarizeStats([row('a', { useful: 8 })]))).toEqual({ a: 0.5 })
    expect(priorityBoosts(summarizeStats([row('b', { notUseful: 8 })]))).toEqual({ b: -0.5 })
  })

  it('lowers templates whose results keep landing off-scope, capped at -1', () => {
    expect(priorityBoosts(summarizeStats([row('c', { results: 40, inScope: 10 })]))).toEqual({
      c: -0.5,
    })
    expect(
      priorityBoosts(summarizeStats([row('d', { results: 40, inScope: 10, notUseful: 9 })])),
    ).toEqual({ d: -1 })
  })
})

describe('feedbackDelta', () => {
  it.each([
    [null, 'useful', { useful: 1, notUseful: 0 }],
    ['useful', 'not_useful', { useful: -1, notUseful: 1 }],
    ['not_useful', null, { useful: 0, notUseful: -1 }],
    ['useful', 'useful', { useful: 0, notUseful: 0 }],
  ] as const)('%s → %s', (previous, next, expected) => {
    expect(feedbackDelta(previous, next)).toEqual(expected)
  })
})

describe('track record and the planner', () => {
  const spec = IntakeSpecSchema.parse({
    goal: 'documents',
    description: 'Reports',
    scope: { domains: ['target.com'] },
    depth: { level: 'quick' },
  })

  it('only lists templates with enough evidence, and the selector message carries it', () => {
    const records = summarizeStats([
      row('doc_by_type', { useful: 9, notUseful: 1, results: 50, inScope: 45 }),
      row('doc_data_files', { useful: 1 }),
    ])
    const text = formatTrackRecord(records)
    expect(text).toBe('- doc_by_type: 83% rated useful (10 ratings), 90% of results in scope')
    expect(buildSelectorUserMessage(spec, text)).toContain(
      'Track record of templates for this goal',
    )
    expect(buildSelectorUserMessage(spec)).not.toContain('Track record')
  })

  it('applies boosts when the budget decides what runs', () => {
    const sel = (templateId: TemplateId, params: Record<string, string[]>): Selection => ({
      templateId,
      params,
      reason: '',
    })
    const selections = [
      ...Array.from({ length: 10 }, () => sel('doc_report_kind', { kind: ['annual report'] })), // priority 2
      sel('doc_data_files', { ext: ['csv'] }), // priority 3
    ]
    const plain = buildPlan(spec, selections).queries.filter((q) => q.batch === 'primary')
    expect(plain.map((q) => q.templateId)).not.toContain('doc_data_files')

    const boosted = buildPlan(spec, selections, { boosts: { doc_data_files: 1.5 } }).queries.filter(
      (q) => q.batch === 'primary',
    )
    expect(boosted[0]?.templateId).toBe('doc_data_files')
  })
})

describe('reviewSuggestions', () => {
  it('suggests changes only with evidence', () => {
    const suggestions = reviewSuggestions(
      summarizeStats([
        row('bad', { notUseful: 9 }),
        row('good', { useful: 12 }),
        row('leaky', { results: 30, inScope: 6 }),
        row('narrow', { queries: 12, results: 8 }),
        row('new', { useful: 1 }),
      ]),
    )
    expect(suggestions.map((s) => [s.templateId, s.kind])).toEqual([
      ['bad', 'retire_or_rework'],
      ['good', 'promote'],
      ['leaky', 'tighten_scope'],
      ['narrow', 'too_narrow'],
    ])
  })
})

describe('outsideScopeVerdict (T-012)', () => {
  it('stays undecided without enough outside-scope ratings', () => {
    expect(
      outsideScopeVerdict({
        main: { useful: 50, notUseful: 10 },
        outside: { useful: 5, notUseful: 5 },
      }).decision,
    ).toBe('undecided')
  })

  it('keeps the fixed batch when outside results are at least half as useful', () => {
    expect(
      outsideScopeVerdict({
        main: { useful: 60, notUseful: 40 },
        outside: { useful: 8, notUseful: 12 },
      }).decision,
    ).toBe('keep_fixed')
  })

  it('switches to shortfall-only when outside results are rarely useful', () => {
    expect(
      outsideScopeVerdict({
        main: { useful: 80, notUseful: 20 },
        outside: { useful: 3, notUseful: 27 },
      }).decision,
    ).toBe('only_on_shortfall')
  })
})
