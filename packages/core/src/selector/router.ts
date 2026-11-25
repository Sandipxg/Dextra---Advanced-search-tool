import { ENABLED_ENGINES, type Engine } from '../schema/enums'
import type { IntakeSpec } from '../schema/intake-spec'

export interface EngineRoute {
  engines: Engine[]
  /** Shown in the pre-run summary, so the choice is visible even in basic mode (D-004). */
  notes: string[]
}

const ENGINE_LABEL: Record<Engine, string> = { google: 'Google', bing: 'Bing', brave: 'Brave' }

/**
 * Hybrid engine selection (D-004): user override in advanced mode replaces everything;
 * otherwise rules pick Google and the LLM may add one enabled engine, never remove one.
 * Only Google is enabled in v1 (D-015), so suggestions are recorded but not used.
 */
export const routeEngines = (
  spec: IntakeSpec,
  suggestion: { engine: Engine; reason: string } | null = null,
): EngineRoute => {
  if (spec.sources.engines !== 'auto') {
    return {
      engines: [...spec.sources.engines],
      notes: [
        `${spec.sources.engines.map((e) => ENGINE_LABEL[e]).join(', ')}: chosen in advanced settings`,
      ],
    }
  }

  const engines: Engine[] = ['google']
  const notes = ['Google: default engine, supports every template operator']
  if (spec.goal === 'news_mentions') notes.push('News templates use the Google News endpoint')

  if (suggestion && !engines.includes(suggestion.engine)) {
    const label = ENGINE_LABEL[suggestion.engine]
    if ((ENABLED_ENGINES as readonly Engine[]).includes(suggestion.engine)) {
      engines.push(suggestion.engine)
      notes.push(`${label}: added — ${suggestion.reason}`)
    } else {
      notes.push(`${label} was suggested (${suggestion.reason}) but isn't available yet`)
    }
  }
  return { engines, notes }
}
