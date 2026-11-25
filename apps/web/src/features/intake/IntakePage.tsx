import {
  AUTH_LINK_USE_CASES,
  CONTENT_TYPE_EXTENSIONS,
  COUNTRY_CODES,
  type ContentType,
  ContentTypeSchema,
  type IntakeSpec,
  IntakeSpecSchema,
  isSecurityGoal,
  SECURITY_USE_CASES,
  type UseCase,
} from '@dextra/core'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Combobox } from '../../components/Combobox'
import { TagInput } from '../../components/TagInput'
import {
  Button,
  Card,
  ChipGroup,
  Field,
  Input,
  Segmented,
  Select,
  Switch,
  Textarea,
} from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import {
  CONTENT_LABELS,
  countryName,
  DEPTH_LABELS,
  GOAL_LABELS,
  TIME_LABELS,
  USE_CASE_LABELS,
} from '../../lib/labels'
import { useSettings } from '../../lib/settings'
import { AdvancedFields } from './AdvancedFields'
import {
  errorAt,
  type SpecForm,
  type SpecPath,
  StrictnessToggle,
  toSiteDomain,
} from './form-helpers'

const COUNTRY_OPTIONS = COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c) })).sort(
  (a, b) => a.label.localeCompare(b.label),
)
const CONTENT_OPTIONS = ContentTypeSchema.options.map((c: ContentType) => ({
  value: c,
  label: CONTENT_LABELS[c],
  hint: CONTENT_TYPE_EXTENSIONS[c].join(', '),
}))

export const DEFAULT_VALUES: SpecForm = {
  goal: undefined as unknown as SpecForm['goal'],
  description: '',
  use_case: null,
  scope: { domains: [], mode: 'soft' },
  filters: {
    country: { value: null, mode: 'soft' },
    location: { value: null, mode: 'soft' },
    language: { value: [], mode: 'soft' },
    time: { value: 'any', custom: null, mode: 'soft' },
    content: { value: [], mode: 'soft' },
  },
  depth: { level: 'standard', per_query: 20, min_results: 15 },
  show_outside_scope: false,
  authorization: null,
}

/** New search: the intake form (Intake-Form-Spec.md). Submits to POST /api/plans. */
export const IntakePage = () => {
  const navigate = useNavigate()
  const advanced = useSettings((s) => s.advanced)
  const form = useForm<SpecForm, unknown, IntakeSpec>({
    resolver: zodResolver(IntakeSpecSchema),
    defaultValues: DEFAULT_VALUES,
  })
  const { control, register, handleSubmit, setError, setValue, formState } = form
  const errors = formState.errors

  const [goal, useCase, time, country, authorization] = useWatch({
    control,
    name: ['goal', 'use_case', 'filters.time.value', 'filters.country.value', 'authorization'],
  })
  const securityGoal = Boolean(goal && isSecurityGoal(goal))
  const securityRun =
    securityGoal ||
    (useCase != null && (AUTH_LINK_USE_CASES as readonly UseCase[]).includes(useCase))
  const needsLink = useCase != null && (AUTH_LINK_USE_CASES as readonly UseCase[]).includes(useCase)
  const useCaseOptions = securityGoal
    ? SECURITY_USE_CASES
    : (Object.keys(USE_CASE_LABELS) as UseCase[])

  const plan = useMutation({
    mutationFn: (spec: IntakeSpec) => api.createPlan(spec),
    onSuccess: ({ run }) => navigate(`/runs/${run.id}`),
    onError: (error) => {
      if (error instanceof ApiError && error.issues.length) {
        for (const issue of error.issues)
          setError(issue.path as SpecPath, { message: issue.message })
        toast.error('Some fields need attention')
      } else {
        toast.error(error instanceof Error ? error.message : 'Could not plan the search')
      }
    },
  })

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={handleSubmit(
          (spec) => plan.mutate(spec),
          () => toast.error('Some fields need attention'),
        )}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl font-semibold">New search</h1>
          <p className="mt-1 text-sm text-muted">
            Describe what you need. You'll see the planned searches and their cost before anything
            runs.
          </p>
        </div>

        <Card>
          <h2 className="mb-4 text-base font-semibold">What are you looking for?</h2>
          <div className="grid gap-5">
            <Field label="Goal" required error={errorAt(errors, 'goal')}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  defaultValue=""
                  {...register('goal')}
                >
                  <option value="" disabled>
                    Choose a goal…
                  </option>
                  {Object.entries(GOAL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Describe it in one or two sentences"
              required
              hint="Used to pick search templates and keywords. Max 300 characters."
              error={errorAt(errors, 'description')}
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  maxLength={300}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  placeholder="e.g. Annual reports and investor presentations published by Infosys"
                  {...register('description')}
                />
              )}
            </Field>
            {(securityGoal || advanced) && (
              <Field
                label="What is this for?"
                required={securityGoal}
                hint={securityGoal ? 'Security goals are only for authorized work.' : undefined}
                error={errorAt(errors, 'use_case')}
              >
                {({ id, describedBy, invalid }) => (
                  <Controller
                    control={control}
                    name="use_case"
                    render={({ field }) => (
                      <Select
                        id={id}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      >
                        <option value="">Not specified</option>
                        {useCaseOptions.map((u) => (
                          <option key={u} value={u}>
                            {USE_CASE_LABELS[u]}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                )}
              </Field>
            )}
          </div>
        </Card>

        {securityRun && (
          <Card className="border-warn bg-warn-soft/40">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="size-5 text-warn" aria-hidden />
              <h2 className="text-base font-semibold">Authorization</h2>
            </div>
            <p className="mb-4 text-sm text-muted">
              Security searches only run against domains you are allowed to test. Domain scope is
              locked to Hard, and your confirmation is recorded.
            </p>
            <div className="space-y-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={authorization?.confirmed === true}
                  onChange={(e) =>
                    setValue(
                      'authorization',
                      e.target.checked
                        ? { confirmed: true, link: authorization?.link ?? null }
                        : null,
                      { shouldValidate: formState.isSubmitted },
                    )
                  }
                />
                <span>I am authorized to test every target domain listed below.</span>
              </label>
              {errorAt(errors, 'authorization') && (
                <p role="alert" className="text-xs text-danger">
                  {errorAt(errors, 'authorization') ?? errorAt(errors, 'authorization.confirmed')}
                </p>
              )}
              <Field
                label="Program or engagement link"
                required={needsLink}
                hint="e.g. the bug bounty program page or the engagement letter link"
                error={errorAt(errors, 'authorization.link')}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="url"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    placeholder="https://"
                    disabled={!authorization?.confirmed}
                    value={authorization?.link ?? ''}
                    onChange={(e) =>
                      setValue(
                        'authorization',
                        { confirmed: true, link: e.target.value || null },
                        {
                          shouldValidate: formState.isSubmitted,
                        },
                      )
                    }
                  />
                )}
              </Field>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 text-base font-semibold">Where should we look?</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field
                label="Target domains"
                required={securityRun}
                hint="Press Enter after each. https://, paths and a leading www. are removed (the whole site is searched). *.example.com for subdomains only."
                error={errorAt(errors, 'scope.domains')}
                aside={
                  advanced ? (
                    <Controller
                      control={control}
                      name="scope.mode"
                      render={({ field }) => (
                        <StrictnessToggle
                          label="Domain"
                          value={field.value ?? 'soft'}
                          onChange={field.onChange}
                          disabled={securityRun}
                        />
                      )}
                    />
                  ) : undefined
                }
              >
                {({ id, describedBy, invalid }) => (
                  <Controller
                    control={control}
                    name="scope.domains"
                    render={({ field }) => (
                      <TagInput
                        id={id}
                        describedBy={describedBy}
                        invalid={invalid}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        normalize={toSiteDomain}
                        invalidMessage="is not a valid domain"
                        placeholder="example.com"
                        max={50}
                      />
                    )}
                  />
                )}
              </Field>
            </div>
            <Field
              label="Country to search from"
              error={errorAt(errors, 'filters.country.value')}
              aside={
                advanced ? (
                  <Controller
                    control={control}
                    name="filters.country.mode"
                    render={({ field }) => (
                      <StrictnessToggle
                        label="Country"
                        value={field.value ?? 'soft'}
                        onChange={field.onChange}
                      />
                    )}
                  />
                ) : undefined
              }
            >
              {({ id, describedBy }) => (
                <Controller
                  control={control}
                  name="filters.country.value"
                  render={({ field }) => (
                    <Combobox
                      id={id}
                      describedBy={describedBy}
                      value={field.value ?? null}
                      options={COUNTRY_OPTIONS}
                      emptyLabel="Any country"
                      onChange={(v) => {
                        field.onChange(v)
                        setValue('filters.location.value', null)
                      }}
                    />
                  )}
                />
              )}
            </Field>
            <Field
              label="Time range"
              error={
                errorAt(errors, 'filters.time.custom') ?? errorAt(errors, 'filters.time.custom.to')
              }
              aside={
                advanced ? (
                  <Controller
                    control={control}
                    name="filters.time.mode"
                    render={({ field }) => (
                      <StrictnessToggle
                        label="Time"
                        value={field.value ?? 'soft'}
                        onChange={field.onChange}
                      />
                    )}
                  />
                ) : undefined
              }
            >
              {({ id, describedBy }) => (
                <Controller
                  control={control}
                  name="filters.time.value"
                  render={({ field }) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      value={field.value ?? 'any'}
                      onChange={(e) => {
                        const next = e.target.value as keyof typeof TIME_LABELS
                        field.onChange(next)
                        setValue(
                          'filters.time.custom',
                          next === 'custom' ? { from: '', to: '' } : null,
                        )
                      }}
                    >
                      {Object.entries(TIME_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              )}
            </Field>
            {time === 'custom' && (
              <div className="grid grid-cols-2 gap-3 md:col-span-2">
                <Field label="From" required error={errorAt(errors, 'filters.time.custom.from')}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      type="date"
                      aria-invalid={invalid}
                      {...register('filters.time.custom.from')}
                    />
                  )}
                </Field>
                <Field label="To" required error={errorAt(errors, 'filters.time.custom.to')}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      type="date"
                      aria-invalid={invalid}
                      {...register('filters.time.custom.to')}
                    />
                  )}
                </Field>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">What kind of content?</h2>
          <Field
            label="Content types"
            hint="None selected means any content."
            aside={
              advanced ? (
                <Controller
                  control={control}
                  name="filters.content.mode"
                  render={({ field }) => (
                    <StrictnessToggle
                      label="Content"
                      value={field.value ?? 'soft'}
                      onChange={field.onChange}
                    />
                  )}
                />
              ) : undefined
            }
          >
            {() => (
              <Controller
                control={control}
                name="filters.content.value"
                render={({ field }) => (
                  <ChipGroup
                    label="Content types"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    options={CONTENT_OPTIONS}
                  />
                )}
              />
            )}
          </Field>
        </Card>

        {advanced && <AdvancedFields country={country ?? null} securityRun={securityRun} />}

        <Card>
          <h2 className="mb-4 text-base font-semibold">How deep?</h2>
          <div className="space-y-5">
            <Controller
              control={control}
              name="depth.level"
              render={({ field }) => (
                <Segmented
                  label="Search depth"
                  value={field.value ?? 'standard'}
                  onChange={field.onChange}
                  options={Object.entries(DEPTH_LABELS).map(([value, label]) => ({
                    value: value as keyof typeof DEPTH_LABELS,
                    label,
                  }))}
                />
              )}
            />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium" id="outside-label">
                  Also show related results outside my filters
                </p>
                <p className="text-xs text-muted">
                  Uses about 20% more searches. Those results appear in a separate “Outside scope”
                  group.
                </p>
              </div>
              <Controller
                control={control}
                name="show_outside_scope"
                render={({ field }) => (
                  <Switch
                    label="Also show related results outside my filters"
                    checked={field.value ?? false}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <p className="text-xs text-muted">Nothing runs until you confirm the plan.</p>
          <Button type="submit" disabled={plan.isPending}>
            {plan.isPending ? 'Planning…' : 'Plan the search'}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
