import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Controller } from 'react-hook-form'
import { Combobox } from '../../components/Combobox'
import { TagInput } from '../../components/TagInput'
import { Card, Field, Input, Segmented, Select } from '../../components/ui'
import { api } from '../../lib/api'
import { WHERE_LABELS } from '../../lib/labels'
import { errorAt, StrictnessToggle, toSiteDomain, useSpecForm } from './form-helpers'
import { PlatformPicker } from './PlatformPicker'

/** C2: cached SERP API locations for the chosen country. */
const LocationField = ({ country }: { country: string | null }) => {
  const { control, formState } = useSpecForm()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const locations = useQuery({
    queryKey: ['locations', country, deferred],
    queryFn: () => api.locations(country as string, deferred),
    enabled: Boolean(country),
    staleTime: 5 * 60_000,
  })
  const options = (locations.data?.locations ?? []).map((l) => ({
    value: l.canonicalName,
    label: l.canonicalName,
  }))

  return (
    <Field
      label="City or region"
      hint={country ? 'Narrow the country to a city or region' : 'Pick a country first'}
      error={errorAt(formState.errors, 'filters.location.value')}
      aside={
        <Controller
          control={control}
          name="filters.location.mode"
          render={({ field }) => (
            <StrictnessToggle
              label="Location"
              value={field.value ?? 'soft'}
              onChange={field.onChange}
            />
          )}
        />
      }
    >
      {({ id, describedBy }) => (
        <Controller
          control={control}
          name="filters.location.value"
          render={({ field }) => (
            <Combobox
              id={id}
              describedBy={describedBy}
              value={field.value ?? null}
              options={
                field.value && !options.some((o) => o.value === field.value)
                  ? [{ value: field.value, label: field.value }, ...options]
                  : options
              }
              onChange={field.onChange}
              onSearch={setQuery}
              emptyLabel={country ? 'Anywhere in the country' : 'Pick a country first'}
            />
          )}
        />
      )}
    </Field>
  )
}

/**
 * Settings → Advanced search options, trimmed to what changes results in practice
 * (D-026): exclusions, city, where keywords appear, extra platforms, and result volume.
 */
export const AdvancedFields = ({ country }: { country: string | null }) => {
  const { control, register, formState } = useSpecForm()
  const errors = formState.errors

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">More options</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label="Domains to exclude"
          hint="Results from these sites are left out."
          error={errorAt(errors, 'scope.exclude_domains')}
        >
          {({ id, describedBy, invalid }) => (
            <Controller
              control={control}
              name="scope.exclude_domains"
              render={({ field }) => (
                <TagInput
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  normalize={toSiteDomain}
                  invalidMessage="is not a valid domain"
                  placeholder="blog.example.com"
                />
              )}
            />
          )}
        </Field>
        <LocationField country={country} />
        <Field label="Where should the keywords appear?">
          {() => (
            <Controller
              control={control}
              name="keywords.where"
              render={({ field }) => (
                <Segmented
                  label="Where keywords appear"
                  value={field.value ?? 'anywhere'}
                  onChange={field.onChange}
                  options={Object.entries(WHERE_LABELS).map(([v, l]) => ({
                    value: v as keyof typeof WHERE_LABELS,
                    label: l,
                  }))}
                />
              )}
            />
          )}
        </Field>
        <Field
          label="Results per search"
          hint="Fetched in pages of 10; each page is one paid search."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              {...register('depth.per_query', { valueAsNumber: true })}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Also search on these platforms"
            aside={
              <Controller
                control={control}
                name="sources.platforms.mode"
                render={({ field }) => (
                  <StrictnessToggle
                    label="Platforms"
                    value={field.value ?? 'soft'}
                    onChange={field.onChange}
                  />
                )}
              />
            }
          >
            {() => (
              <Controller
                control={control}
                name="sources.platforms.value"
                render={({ field }) => (
                  <PlatformPicker value={field.value ?? []} onChange={field.onChange} />
                )}
              />
            )}
          </Field>
        </div>
        <Field
          label="Minimum useful results before widening"
          hint="Below this, wider searches run (if the filter is Soft)."
          error={errorAt(errors, 'depth.min_results')}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={500}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              {...register('depth.min_results', {
                // Empty → default (15) instead of NaN.
                setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
              })}
            />
          )}
        </Field>
      </div>
    </Card>
  )
}
