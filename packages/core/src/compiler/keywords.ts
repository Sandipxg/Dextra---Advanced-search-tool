import type { IntakeSpec } from '../schema/intake-spec'
import { cleanText, join, orGroup, phrase, term } from './tokens'

type Keywords = IntakeSpec['keywords']

/** D2 + D4 with D5 placement: the Hard keyword layer appended to every query. */
export const compileRequiredKeywords = (k: Keywords): string => {
  const place = (t: string, isPhrase: boolean): string => {
    const value = isPhrase ? phrase(t) : term(t)
    if (!value) return ''
    if (k.where === 'title') return `intitle:${value}`
    if (k.where === 'url') {
      // inurl: works on single words; spaced values become one inurl: per word.
      return cleanText(t)
        .split(' ')
        .map((w) => `inurl:${term(w)}`)
        .join(' ')
    }
    return value
  }
  return join(...k.all.map((t) => place(t, false)), ...k.phrases.map((t) => place(t, true)))
}

/** `{keywords}` var: D2 + D4 + D3 as `(a OR b)`. Empty when the user gave none. */
export const compileKeywordsVar = (k: Keywords): string =>
  join(compileRequiredKeywords(k), orGroup(k.any.map(term)))

/** `-term` / `-"two words"` from the confirmed A5 exclusions. */
export const compileExcludedTerms = (k: Keywords): string =>
  join(...k.exclude.map((t) => (term(t) ? `-${term(t)}` : '')))
