import { X } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import { cn } from '../lib/cn'

/**
 * Free-text list (domains, keywords, names). Enter, comma or paste adds entries;
 * `normalize` can rewrite or reject each one (returns null → shown as an error).
 */
export const TagInput = ({
  id,
  value,
  onChange,
  placeholder,
  normalize = (s) => s.trim() || null,
  invalidMessage = 'is not valid',
  describedBy,
  invalid,
  max,
}: {
  id?: string
  value: readonly string[]
  onChange: (value: string[]) => void
  placeholder?: string
  normalize?: (raw: string) => string | null
  /** Shown after the rejected entry, e.g. `"foo": is not a valid domain`. */
  invalidMessage?: string
  describedBy?: string | undefined
  invalid?: boolean
  max?: number
}) => {
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState<string | null>(null)

  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...value]
    for (const part of parts) {
      const normal = normalize(part)
      if (!normal) {
        setRejected(`"${part.slice(0, 80)}" ${invalidMessage}`)
        continue
      }
      if (!next.some((v) => v.toLowerCase() === normal.toLowerCase())) next.push(normal)
    }
    onChange(max ? next.slice(0, max) : next)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5',
          invalid && 'border-danger',
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-sm"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((v) => v !== tag))}
              className="text-muted hover:text-text"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => {
            setRejected(null)
            setDraft(e.target.value)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (/[,\n]/.test(text)) {
              e.preventDefault()
              add(text)
            }
          }}
          className="min-w-32 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted"
        />
      </div>
      {rejected && <p className="mt-1 text-xs text-danger">{rejected}</p>}
    </div>
  )
}
