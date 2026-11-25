import { LANGUAGE_CODES, OutputFormatSchema, PlatformSchema, ResultTypeSchema } from '@dextra/core'
import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Controller } from 'react-hook-form'
import { Combobox } from '../../components/Combobox'
import { TagInput } from '../../components/TagInput'
import { Card, ChipGroup, Field, Input, Segmented, Select, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import {
  languageName,
  OUTPUT_LABELS,
  PLATFORM_LABELS,
  PREFERENCE_LABELS,
  RESULT_TYPE_LABELS,
  SUBDOMAIN_LABELS,
  WHERE_LABELS,
} from '../../lib/labels'
import { errorAt, StrictnessToggle, toSiteDomain, useSpecForm } from './form-helpers'

const LANGUAGE_OPTIONS = LANGUAGE_CODES.map((c) => ({ value: c, label: languageName(c) })).sort(
  (a, b) => a.label.localeCompare(b.label),
)

const isHttpUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

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
      hint={country ? 'Search the provider’s location list' : 'Pick a country first'}
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

/** Fields hidden behind Settings → Advanced search options (D-006). */
export const AdvancedFields = ({
  country,
  securityRun,
}: {
  country: string | null
  securityRun: boolean
}) => {
  const { control, register, formState } = useSpecForm()
  const errors = formState.errors

  return (
    <>
      <Card>
        <h2 className="mb-4 text-base font-semibold">Advanced: intent and scope</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field
              label="What would a perfect result look like?"
              error={errorAt(errors, 'perfect_result.text')}
            >
              {({ id }) => (
                <Textarea id={id} maxLength={500} {...register('perfect_result.text')} />
              )}
            </Field>
          </div>
          <Field
            label="Example URLs (up to 3)"
            error={errorAt(errors, 'perfect_result.example_urls')}
          >
            {({ id, invalid }) => (
              <Controller
                control={control}
                name="perfect_result.example_urls"
                render={({ field }) => (
                  <TagInput
                    id={id}
                    invalid={invalid}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    normalize={isHttpUrl}
                    invalidMessage="is not an http(s) URL"
                    placeholder="https://"
                    max={3}
                  />
                )}
              />
            )}
          </Field>
          <Field
            label="Anything you definitely don't want?"
            hint="Turned into exclusions you confirm before the run."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={300}
                {...register('avoid')}
              />
            )}
          </Field>
          <Field label="Subdomains">
            {({ id }) => (
              <Select id={id} {...register('scope.subdomains')}>
                {Object.entries(SUBDOMAIN_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Domains to exclude" error={errorAt(errors, 'scope.exclude_domains')}>
            {({ id, invalid }) => (
              <Controller
                control={control}
                name="scope.exclude_domains"
                render={({ field }) => (
                  <TagInput
                    id={id}
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
          <Field
            label="Names, brands or products"
            hint="Used by mention, news and review templates."
          >
            {({ id, describedBy }) => (
              <Controller
                control={control}
                name="scope.names"
                render={({ field }) => (
                  <TagInput
                    id={id}
                    describedBy={describedBy}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Example Corp"
                    max={20}
                  />
                )}
              />
            )}
          </Field>
          <Field
            label="Results you already have"
            hint="One URL per line; they are left out of the report."
            error={errorAt(errors, 'scope.known_urls')}
          >
            {({ id, describedBy, invalid }) => (
              <Controller
                control={control}
                name="scope.known_urls"
                render={({ field }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    defaultValue={(field.value ?? []).join('\n')}
                    onBlur={(e) =>
                      field.onChange(
                        e.target.value
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                )}
              />
            )}
          </Field>
          {securityRun && (
            <p className="text-xs text-muted md:col-span-2">
              Domain scope is locked to Hard for security work.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold">Advanced: location, language and keywords</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <LocationField country={country} />
          <Field
            label="Result languages"
            hint="Only the first one is sent to the search engine."
            aside={
              <Controller
                control={control}
                name="filters.language.mode"
                render={({ field }) => (
                  <StrictnessToggle
                    label="Language"
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
                name="filters.language.value"
                render={({ field }) => {
                  const value = field.value ?? []
                  return (
                    <div className="space-y-2">
                      <Combobox
                        id={id}
                        describedBy={describedBy}
                        value={null}
                        options={LANGUAGE_OPTIONS.filter((o) => !value.includes(o.value as never))}
                        emptyLabel="Add a language…"
                        allowEmpty={false}
                        onChange={(v) => v && field.onChange([...value, v].slice(0, 10))}
                      />
                      {value.length > 0 && (
                        <ChipGroup
                          label="Selected languages (click to remove)"
                          value={value}
                          onChange={field.onChange}
                          options={value.map((v) => ({ value: v, label: `${languageName(v)} ×` }))}
                        />
                      )}
                    </div>
                  )
                }}
              />
            )}
          </Field>
          <Field label="Words that must appear" hint="Hard: every query includes them.">
            {({ id, describedBy }) => (
              <Controller
                control={control}
                name="keywords.all"
                render={({ field }) => (
                  <TagInput
                    id={id}
                    describedBy={describedBy}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    max={20}
                  />
                )}
              />
            )}
          </Field>
          <Field label="Words where any one is enough" hint="Open: used to rank results.">
            {({ id, describedBy }) => (
              <Controller
                control={control}
                name="keywords.any"
                render={({ field }) => (
                  <TagInput
                    id={id}
                    describedBy={describedBy}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    max={20}
                  />
                )}
              />
            )}
          </Field>
          <Field label="Exact phrases">
            {({ id }) => (
              <Controller
                control={control}
                name="keywords.phrases"
                render={({ field }) => (
                  <TagInput id={id} value={field.value ?? []} onChange={field.onChange} max={10} />
                )}
              />
            )}
          </Field>
          <Field label="Where should those words appear?">
            {() => (
              <Controller
                control={control}
                name="keywords.where"
                render={({ field }) => (
                  <Segmented
                    label="Where words appear"
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
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold">Advanced: sources and output</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Search engine"
            hint="Only Google is available for now."
            error={errorAt(errors, 'sources.engines')}
          >
            {() => (
              <Controller
                control={control}
                name="sources.engines"
                render={({ field }) => (
                  <Segmented
                    label="Search engine"
                    value={field.value === 'auto' || field.value === undefined ? 'auto' : 'google'}
                    onChange={(v) => field.onChange(v === 'auto' ? 'auto' : ['google'])}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'google', label: 'Google' },
                    ]}
                  />
                )}
              />
            )}
          </Field>
          <Field label="Result types">
            {() => (
              <Controller
                control={control}
                name="sources.types"
                render={({ field }) => (
                  <ChipGroup
                    label="Result types"
                    value={field.value ?? ['web']}
                    onChange={field.onChange}
                    options={ResultTypeSchema.options.map((v) => ({
                      value: v,
                      label: RESULT_TYPE_LABELS[v],
                    }))}
                  />
                )}
              />
            )}
          </Field>
          <div className="md:col-span-2">
            <Field
              label="Outside platforms to also search"
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
                    <ChipGroup
                      label="Platforms"
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={PlatformSchema.options.map((v) => ({
                        value: v,
                        label: PLATFORM_LABELS[v],
                      }))}
                    />
                  )}
                />
              )}
            </Field>
          </div>
          <Field label="Sites to never show" error={errorAt(errors, 'sources.never')}>
            {({ id, invalid }) => (
              <Controller
                control={control}
                name="sources.never"
                render={({ field }) => (
                  <TagInput
                    id={id}
                    invalid={invalid}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    normalize={toSiteDomain}
                    invalidMessage="is not a valid domain"
                    placeholder="pinterest.com"
                  />
                )}
              />
            )}
          </Field>
          <Field label="Source preference" hint="Re-ranks only.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} {...register('sources.preference')}>
                {Object.entries(PREFERENCE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Results per search"
            hint="Fetched in pages of 10; each page is one paid request."
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
          <Field
            label="Minimum useful results before widening"
            error={errorAt(errors, 'depth.min_results')}
          >
            {({ id, invalid }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={500}
                aria-invalid={invalid}
                {...register('depth.min_results', {
                  // Empty → default (15) instead of NaN.
                  setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                })}
              />
            )}
          </Field>
          <Field label="Output">
            {() => (
              <Controller
                control={control}
                name="output"
                render={({ field }) => (
                  <ChipGroup
                    label="Output formats"
                    value={field.value ?? ['ranked']}
                    onChange={field.onChange}
                    options={OutputFormatSchema.options.map((v) => ({
                      value: v,
                      label: OUTPUT_LABELS[v],
                    }))}
                  />
                )}
              />
            )}
          </Field>
          <div className="md:col-span-2">
            <Field label="Anything else the tool should know?">
              {({ id }) => <Textarea id={id} maxLength={1000} {...register('notes')} />}
            </Field>
          </div>
        </div>
      </Card>
    </>
  )
}
