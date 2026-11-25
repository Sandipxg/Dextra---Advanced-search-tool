import type { Platform } from '@dextra/core'
import { useEffect, useId, useRef } from 'react'
import { ChipGroup } from '../../components/ui'
import { PLATFORM_GROUPS, PLATFORM_LABELS } from '../../lib/labels'

const ALL_PLATFORMS: Platform[] = PLATFORM_GROUPS.flatMap((g) => g.platforms)

/**
 * E3 platforms grouped by kind, with a "Select all" checkbox (D-027). The checkbox shows
 * a partly-selected state when only some platforms are ticked.
 */
export const PlatformPicker = ({
  value,
  onChange,
}: {
  value: readonly Platform[]
  onChange: (value: Platform[]) => void
}) => {
  const id = useId()
  const allRef = useRef<HTMLInputElement>(null)
  const all = value.length === ALL_PLATFORMS.length
  const some = value.length > 0 && !all

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = some
  }, [some])

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="flex w-fit items-center gap-2 text-sm font-medium">
        <input
          id={id}
          ref={allRef}
          type="checkbox"
          className="size-4"
          checked={all}
          onChange={() => onChange(all ? [] : [...ALL_PLATFORMS])}
        />
        Select all ({ALL_PLATFORMS.length})
      </label>
      <p className="text-xs text-muted">
        Each platform adds at least one search. You'll see the total on the next page before
        anything runs.
      </p>
      {PLATFORM_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{group.label}</p>
          <ChipGroup
            label={`${group.label} platforms`}
            value={value.filter((v) => group.platforms.includes(v))}
            onChange={(picked) =>
              onChange([...value.filter((v) => !group.platforms.includes(v)), ...picked])
            }
            options={group.platforms.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
          />
        </div>
      ))}
    </div>
  )
}
