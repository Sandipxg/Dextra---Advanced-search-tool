import { parse } from 'yaml'
import { type Template, TemplateLibrarySchema } from './schema'

/**
 * Reads every ```yaml block in Template-Library.md whose first key is `id:` and validates
 * the whole library. Used by the generator and the freshness test — not exported from the
 * package, so `yaml` stays a dev dependency.
 */
export const parseTemplateLibrary = (markdown: string): Template[] => {
  const blocks = [...markdown.replace(/\r\n/g, '\n').matchAll(/```yaml\n([\s\S]*?)```/g)]
    .map((m) => m[1] ?? '')
    .filter((body) => /^id:\s/m.test(body))

  const raw = blocks.map((body, i) => {
    try {
      return parse(body) as unknown
    } catch (err) {
      throw new Error(`YAML block ${i + 1}: ${(err as Error).message}`)
    }
  })

  const result = TemplateLibrarySchema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const [index, ...rest] = issue.path
      const id =
        typeof index === 'number' ? ((raw[index] as { id?: string })?.id ?? `#${index}`) : '?'
      return `  ${id}${rest.length ? `.${rest.join('.')}` : ''}: ${issue.message}`
    })
    throw new Error(`Template library is invalid:\n${lines.join('\n')}`)
  }
  return result.data
}
