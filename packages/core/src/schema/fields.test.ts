import { describe, expect, it } from 'vitest'
import { HttpUrlSchema, normalizeDomain, TagSchema, uniqueList } from './fields'
import { COUNTRY_CODES, LANGUAGE_CODES } from './iso-codes'

describe('normalizeDomain', () => {
  it.each([
    ['target.com', 'target.com'],
    ['  Target.COM  ', 'target.com'],
    ['https://Target.com/path/?q=1#x', 'target.com'],
    ['http://user:pw@shop.target.com:8443/', 'shop.target.com'],
    ['target.com.', 'target.com'],
    ['*.target.com', '*.target.com'],
    ['*.https://target.com', null],
    ['münchen.de', 'xn--mnchen-3ya.de'],
    ['sub.domain.co.in', 'sub.domain.co.in'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected)
  })

  it.each([
    '',
    'localhost',
    'not a domain',
    '192.168.1.1',
    '-bad.com',
    'bad-.com',
    'ftp://target.com',
    'target',
    `${'a'.repeat(64)}.com`,
  ])('rejects %j', (input) => {
    expect(normalizeDomain(input)).toBeNull()
  })
})

describe('HttpUrlSchema', () => {
  it('accepts http(s) only', () => {
    expect(HttpUrlSchema.safeParse('https://hackerone.com/target').success).toBe(true)
    expect(HttpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
    expect(HttpUrlSchema.safeParse('ftp://x.com/a').success).toBe(false)
  })
})

describe('TagSchema / uniqueList', () => {
  it('trims, rejects empty and control characters', () => {
    expect(TagSchema.parse('  annual report ')).toBe('annual report')
    expect(TagSchema.safeParse('   ').success).toBe(false)
    expect(TagSchema.safeParse('a\u0000b').success).toBe(false)
  })

  it('dedupes case-insensitively, keeping first spelling and order', () => {
    expect(uniqueList(TagSchema, 10).parse(['PDF', 'pdf', 'Deck', 'pdf '])).toEqual(['PDF', 'Deck'])
  })
})

describe('ISO lists', () => {
  it('have the ISO standard sizes and include common codes', () => {
    expect(COUNTRY_CODES).toHaveLength(249)
    expect(LANGUAGE_CODES).toHaveLength(183)
    expect(COUNTRY_CODES).toContain('in')
    expect(COUNTRY_CODES).not.toContain('uk')
    expect(LANGUAGE_CODES).toEqual(expect.arrayContaining(['en', 'hi', 'gu']))
    expect(LANGUAGE_CODES).not.toContain('iw')
  })
})
