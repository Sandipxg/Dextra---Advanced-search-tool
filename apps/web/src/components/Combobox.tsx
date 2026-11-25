import { Check, ChevronsUpDown } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export interface ComboOption {
  value: string
  label: string
}

/**
 * Searchable dropdown that stores a code and shows a label (D-005). Keyboard: type to
 * filter, arrows to move, Enter to pick, Escape to close. Pass `onSearch` to load options
 * from the server instead of filtering locally.
 */
export const Combobox = ({
  id,
  value,
  options,
  onChange,
  emptyLabel = 'Any',
  allowEmpty = true,
  onSearch,
  describedBy,
  invalid,
}: {
  id?: string
  value: string | null
  options: readonly ComboOption[]
  onChange: (value: string | null) => void
  emptyLabel?: string
  allowEmpty?: boolean
  onSearch?: (query: string) => void
  describedBy?: string | undefined
  invalid?: boolean
}) => {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list =
      onSearch || !q
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(q) || o.value === q)
    return [...(allowEmpty ? [{ value: '', label: emptyLabel }] : []), ...list].slice(0, 100)
  }, [query, options, onSearch, allowEmpty, emptyLabel])

  const selected = options.find((o) => o.value === value)

  const pick = (option: ComboOption) => {
    onChange(option.value || null)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-center rounded-md border border-border bg-surface',
          invalid && 'border-danger',
        )}
      >
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={describedBy}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          value={open ? query : (selected?.label ?? (value ? value : ''))}
          placeholder={selected ? selected.label : value ? value : emptyLabel}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
            onSearch?.(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && open) {
              e.preventDefault()
              const option = filtered[active]
              if (option) pick(option)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-text"
        />
        <ChevronsUpDown className="mr-2 size-4 shrink-0 text-muted" aria-hidden />
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted">No matches</p>}
          {filtered.map((o, i) => (
            // Keyboard selection is handled by the combobox input (aria-activedescendant),
            // so options only need mouse handlers and stay out of the tab order.
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled on the input
            <div
              key={o.value || '__empty'}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={o.value === (value ?? '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm',
                i === active && 'bg-surface-2',
                !o.value && 'text-muted',
              )}
            >
              {o.label}
              {o.value === (value ?? '') && <Check className="size-4 text-accent" aria-hidden />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
