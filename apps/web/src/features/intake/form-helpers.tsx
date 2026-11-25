import {
  type IntakeSpec,
  type IntakeSpecInput,
  normalizeDomain,
  type Strictness,
} from '@dextra/core'
import { type FieldErrors, get, type Path, useFormContext } from 'react-hook-form'
import { Segmented } from '../../components/ui'
import { STRICTNESS_HINTS, STRICTNESS_LABELS } from '../../lib/labels'

export type SpecForm = IntakeSpecInput
export type SpecPath = Path<SpecForm>

export const useSpecForm = () => useFormContext<SpecForm, unknown, IntakeSpec>()

/** First error message at `path`, or inside its array items (`scope.domains.2`). */
export const errorAt = (errors: FieldErrors<SpecForm>, path: string): string | undefined => {
  const node = get(errors, path) as unknown
  if (!node || typeof node !== 'object') return undefined
  if ('message' in node && typeof node.message === 'string') return node.message
  if (Array.isArray(node)) {
    const item = node.find((n) => n && typeof n === 'object' && 'message' in n) as
      | { message?: string }
      | undefined
    return item?.message
  }
  return undefined
}

const STRICTNESS_OPTIONS = (['hard', 'soft', 'open'] as const).map((value) => ({
  value,
  label: STRICTNESS_LABELS[value],
  title: STRICTNESS_HINTS[value],
}))

/** Per-filter Hard / Soft / Open toggle (advanced mode only, D-006). */
export const StrictnessToggle = ({
  value,
  onChange,
  label,
  disabled,
}: {
  value: Strictness
  onChange: (value: Strictness) => void
  label: string
  disabled?: boolean
}) =>
  disabled ? (
    <span className="text-xs text-muted" title="Locked for security work">
      Hard · locked
    </span>
  ) : (
    <Segmented
      size="sm"
      label={`${label} strictness`}
      value={value}
      onChange={onChange}
      options={STRICTNESS_OPTIONS}
    />
  )

/**
 * Domain fields in the form: the shared normaliser plus dropping a leading `www.`, since a
 * pasted `https://www.example.com/...` almost always means the whole site.
 */
export const toSiteDomain = (raw: string): string | null =>
  normalizeDomain(raw)?.replace(/^www\./, '') ?? null
