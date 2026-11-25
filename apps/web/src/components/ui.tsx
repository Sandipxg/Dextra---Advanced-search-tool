import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { cn } from '../lib/cn'

const control =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted disabled:opacity-60 aria-[invalid=true]:border-danger'

export const Button = ({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) => (
  <button
    type="button"
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
      variant === 'primary' && 'bg-accent text-accent-fg hover:opacity-90',
      variant === 'secondary' && 'border border-border bg-surface hover:bg-surface-2',
      variant === 'ghost' && 'hover:bg-surface-2',
      variant === 'danger' && 'bg-danger text-white hover:opacity-90',
      className,
    )}
    {...props}
  />
)

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(control, className)} {...props} />
)

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(control, 'min-h-20', className)} {...props} />
)

export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'pr-8', className)} {...props} />
)

/** Label + control + hint + error, with ids wired for screen readers. */
export const Field = ({
  label,
  hint,
  error,
  required,
  aside,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | undefined
  required?: boolean
  aside?: ReactNode
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}) => {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        {aside}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const Card = ({ className, ...props }: { className?: string; children: ReactNode }) => (
  <section className={cn('rounded-lg border border-border bg-surface p-5', className)} {...props} />
)

export const Badge = ({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok'
  children: ReactNode
}) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      tone === 'neutral' && 'bg-surface-2 text-muted',
      tone === 'accent' && 'bg-accent-soft text-accent',
      tone === 'warn' && 'bg-warn-soft text-warn',
      tone === 'danger' && 'bg-danger-soft text-danger',
      tone === 'ok' && 'bg-ok-soft text-ok',
    )}
  >
    {children}
  </span>
)

export const Switch = ({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id?: string
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
      checked ? 'bg-accent' : 'bg-border',
    )}
  >
    <span
      className={cn(
        'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0.5',
      )}
    />
  </button>
)

/** Single choice from a few options, as a row of buttons. */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string; title?: string }>
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
}) => (
  // Segmented control: buttons with role="radio" inside a radiogroup is the ARIA pattern;
  // native radio inputs can't be styled as one joined control without extra markup.
  <div
    role="radiogroup"
    aria-label={label}
    className="inline-flex flex-wrap rounded-md border border-border bg-surface-2 p-0.5"
  >
    {options.map((o) => (
      // biome-ignore lint/a11y/useSemanticElements: ARIA radio button in a segmented control
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        title={o.title}
        onClick={() => onChange(o.value)}
        className={cn(
          'rounded px-3 py-1.5 font-medium transition-colors',
          size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm',
          value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
)

/** Multiple choice as toggle chips. */
export const ChipGroup = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: readonly T[]
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T[]) => void
  label: string
}) => (
  <fieldset aria-label={label} className="m-0 flex flex-wrap gap-2 border-0 p-0">
    {options.map((o) => {
      const on = value.includes(o.value)
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
          className={cn(
            'rounded-full border px-3 py-1 text-sm transition-colors',
            on
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border bg-surface text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      )
    })}
  </fieldset>
)
