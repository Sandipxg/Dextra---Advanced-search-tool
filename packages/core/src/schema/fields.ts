import { z } from 'zod'

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const TLD = '(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})'
const HOSTNAME = new RegExp(`^(?=.{1,253}$)(?:${LABEL}\\.)+${TLD}$`)

/**
 * Normalises what a user types into a domain field: trims, lowercases, strips scheme,
 * credentials, port, path, query and trailing dot, and converts IDNs to punycode.
 * Returns null when the input can't be a hostname. Keeps a leading `*.` wildcard.
 */
export const normalizeDomain = (input: string): string | null => {
  let raw = input.trim().toLowerCase()
  const wildcard = raw.startsWith('*.')
  if (wildcard) raw = raw.slice(2)
  if (!raw || /\s/.test(raw)) return null
  // `*.https://x.com` is malformed: a wildcard must be followed by a bare host.
  if (wildcard && raw.includes('://')) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const host = url.hostname.replace(/\.$/, '')
    if (!HOSTNAME.test(host)) return null
    return wildcard ? `*.${host}` : host
  } catch {
    return null
  }
}

/** B1 / B3 / E4 entry: a normalised hostname or `*.hostname`. */
export const DomainSchema = z.string().transform((value, ctx) => {
  const domain = normalizeDomain(value)
  if (!domain) {
    ctx.addIssue({ code: 'custom', message: `"${value.slice(0, 80)}" is not a valid domain` })
    return z.NEVER
  }
  return domain
})

/** http(s) URL only (A3 examples, B6 known results, F6 engagement link). */
export const HttpUrlSchema = z.url({ protocol: /^https?$/, hostname: z.regexes.domain })

/** Free text with a length cap and no control characters. */
export const textField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
    .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), {
      message: 'Contains control characters',
    })

/** One keyword / name tag (D2–D4, B4). */
export const TagSchema = textField(100).pipe(z.string().min(1, 'Empty tag'))

/** De-duplicated list (case-insensitive), order kept. */
export const uniqueList = <T extends z.ZodType<string>>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .transform((items) => {
      const seen = new Set<string>()
      return items.filter((v) => {
        const key = v.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })

/** ISO date, YYYY-MM-DD, must be a real calendar date. */
export const IsoDateSchema = z.iso.date()
