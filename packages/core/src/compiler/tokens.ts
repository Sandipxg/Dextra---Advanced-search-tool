/**
 * Query string helpers. Google dialect: implicit AND, `OR` binds tighter than AND,
 * `"..."` exact phrase, `-x` exclusion, `op:value` operators.
 */

/** Splits a query into tokens, keeping quoted phrases (with any prefix/suffix) whole. */
export const tokenize = (query: string): string[] => query.match(/[^\s"]*"[^"]*"[^\s"]*|\S+/g) ?? []

/** Removes quotes and control characters, collapses whitespace. */
export const cleanText = (text: string): string =>
  text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
    .replace(/["\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Makes user text safe as one query term: anything that could act as an operator
 * (spaces, `:`, parens, `|`, `*`, leading `-`, bare OR/AND) is wrapped in quotes,
 * where Google treats it as literal text.
 */
export const term = (text: string): string => {
  const clean = cleanText(text)
  if (!clean) return ''
  const risky = /[\s:()|*]/.test(clean) || clean.startsWith('-') || /^(OR|AND)$/i.test(clean)
  return risky ? `"${clean}"` : clean
}

/** Always-quoted phrase (names, exact phrases). */
export const phrase = (text: string): string => {
  const clean = cleanText(text)
  return clean ? `"${clean}"` : ''
}

/** `(a OR b)`, or just `a` for one item; empty for none. */
export const orGroup = (items: readonly string[]): string => {
  const parts = items.filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? ''
  return `(${parts.join(' OR ')})`
}

/**
 * Intent words that describe what the user wants to *do*, not what the page is about
 * (T-023). Kept out of the required AND layer and out of relevance scoring: "download",
 * "free" and the like otherwise drag in parked domains and off-topic "Download X" pages.
 */
export const INTENT_WORDS: ReadonlySet<string> = new Set([
  'download',
  'downloads',
  'free',
  'full',
  'watch',
  'online',
  'stream',
  'streaming',
  'hd',
  'play',
])

/** True when the cleaned, lowercased text is a single intent word. */
export const isIntentWord = (text: string): boolean =>
  INTENT_WORDS.has(cleanText(text).toLowerCase())

/** Words as Google counts them for its 32-word limit (OR and parens don't count). */
export const wordCount = (query: string): number =>
  query
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== 'OR').length

export const GOOGLE_WORD_LIMIT = 32

/** Strips a `*.` wildcard: Google ignores `site:*.` (T-001), so scope uses the base host. */
export const baseHost = (domain: string): string => domain.replace(/^\*\./, '')

/** Joins non-empty parts with single spaces. */
export const join = (...parts: Array<string | undefined>): string =>
  parts.filter((p): p is string => Boolean(p?.trim())).join(' ')
