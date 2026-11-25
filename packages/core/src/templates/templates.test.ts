import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GOALS } from '../schema/goal'
import {
  getTemplate,
  paramValuesFor,
  TEMPLATE_IDS,
  TEMPLATES,
  TemplateIdSchema,
  TemplateSchema,
  templatesForGoal,
} from './index'
import { parseTemplateLibrary } from './parse-library'

const LIBRARY_MD = resolve(import.meta.dirname, '../../../../docs/Template-Library.md')

describe('generated library', () => {
  it('matches docs/Template-Library.md (run `pnpm --filter @dextra/core gen:templates` if not)', () => {
    const fromDocs = parseTemplateLibrary(readFileSync(LIBRARY_MD, 'utf8'))
    expect(TEMPLATES).toEqual(fromDocs)
    expect(TEMPLATE_IDS).toEqual(fromDocs.filter((t) => t.status === 'approved').map((t) => t.id))
  })

  it('has 41 templates covering every goal with a priority-1 template', () => {
    expect(TEMPLATES).toHaveLength(41)
    for (const goal of GOALS) {
      const forGoal = templatesForGoal(goal)
      expect(forGoal.length, goal).toBeGreaterThanOrEqual(3)
      expect(
        forGoal.some((t) => t.priority === 1),
        goal,
      ).toBe(true)
    }
  })

  it('has exactly the 12 security templates from D-012', () => {
    const security = TEMPLATES.filter((t) => t.sensitivity === 'security').map((t) => t.id)
    expect(security).toHaveLength(12)
    expect(security).toEqual(expect.arrayContaining(['tp_code_mentions', 'tp_paste_mentions']))
    expect(security.filter((id) => id.startsWith('exp_') || id.startsWith('as_'))).toHaveLength(10)
  })

  it('only targets Google in v1 (D-015)', () => {
    expect(new Set(TEMPLATES.flatMap((t) => t.engines))).toEqual(new Set(['google']))
  })
})

describe('TemplateIdSchema', () => {
  it('accepts library ids and rejects invented ones', () => {
    expect(TemplateIdSchema.parse('doc_by_type')).toBe('doc_by_type')
    expect(TemplateIdSchema.safeParse('doc_by_typ').success).toBe(false)
    expect(TemplateIdSchema.safeParse('site:evil.com').success).toBe(false)
  })

  it('looks templates up by id', () => {
    expect(getTemplate('as_subdomains').scope_mode).toBe('subdomains')
  })
})

describe('paramValuesFor (D-011)', () => {
  const registry = getTemplate('co_registry_profiles')

  it('offers India-only sources only for India', () => {
    expect(paramValuesFor(registry, 'in').platform).toContain('zaubacorp.com')
    expect(paramValuesFor(registry, 'us').platform).not.toContain('zaubacorp.com')
    expect(paramValuesFor(registry, null).platform).not.toContain('tofler.in')
    expect(paramValuesFor(registry, null).platform).toContain('crunchbase.com')
  })

  it('leaves templates without regional values untouched', () => {
    const docs = getTemplate('doc_by_type')
    expect(paramValuesFor(docs, null)).toEqual(docs.params)
  })
})

describe('TemplateSchema rules', () => {
  const valid = {
    id: 'doc_test',
    goal: 'documents',
    title: 'Test',
    query: 'filetype:{ext}',
    params: { ext: ['pdf'] },
    max_pick: 1,
    combine: 'or',
    vars: [],
    scope_mode: 'optional',
    engines: ['google'],
    result_type: 'web',
    signal: 'pdf',
    priority: 1,
    sensitivity: 'normal',
    status: 'approved',
    example: 'site:x.com filetype:pdf',
  }

  const messages = (patch: Record<string, unknown>) => {
    const res = TemplateSchema.safeParse({ ...valid, ...patch })
    return res.success ? [] : res.error.issues.map((i) => i.message)
  }

  it('accepts the valid base', () => {
    expect(messages({})).toEqual([])
  })

  it.each([
    ['positive site:', { query: 'site:evil.com filetype:{ext}' }, /positive site:/],
    ['ext:', { query: 'ext:{ext}' }, /ext:/],
    ['intext:', { query: 'intext:{ext}' }, /intext/],
    ['retired operator', { query: 'related:{ext}' }, /retired/],
    ['unknown placeholder', { query: 'filetype:{ext} {secret}' }, /neither a param nor a var/],
    ['unused param', { query: 'filetype:pdf' }, /not used in the query/],
    ['unused var', { vars: ['name'] }, /var name is not used/],
    [
      'platform without platform scope',
      { params: { ext: ['pdf'], platform: ['github.com'] } },
      /platform param only/,
    ],
    ['platform scope without platform', { scope_mode: 'platform' }, /needs a platform param/],
    ['quote in param value', { params: { ext: ['pdf" OR site:evil.com'] } }, /quotes, braces/],
    ['wrong id prefix', { id: 'tp_test' }, /must start with "doc_"/],
    [
      'security goal not security',
      { goal: 'exposed_pages', id: 'exp_test', scope_mode: 'required' },
      /must be security/,
    ],
    ['security template web-wide', { sensitivity: 'security' }, /tied to the target scope/],
    ['regional key not a value', { regional: { docx: ['in'] } }, /not a param value/],
    ['max_pick 0 with params', { max_pick: 0 }, /at least 1/],
    ['unknown field', { secret: true }, /Unrecognized key/],
  ])('rejects %s', (_name, patch, pattern) => {
    expect(messages(patch).some((m) => pattern.test(m))).toBe(true)
  })
})
