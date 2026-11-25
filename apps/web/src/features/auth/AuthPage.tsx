import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Button, Card, Field, Input, Segmented } from '../../components/ui'
import { authClient } from '../../lib/auth'

export const AuthPage = () => {
  const navigate = useNavigate()
  const session = authClient.useSession()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session.data) return <Navigate to="/" replace />

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    setBusy(true)
    setError(null)
    const result =
      mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get('name') ?? '') })
    setBusy(false)
    if (result.error) {
      setError(result.error.message ?? 'That did not work. Check your details and try again.')
      return
    }
    await session.refetch()
    navigate('/', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Dextra</h1>
      <p className="mb-6 text-sm text-muted">Precise web searches from a short form.</p>
      <Card>
        <div className="mb-5">
          <Segmented
            label="Account"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
            }}
            options={[
              { value: 'sign-in', label: 'Sign in' },
              { value: 'sign-up', label: 'Create account' },
            ]}
          />
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'sign-up' && (
            <Field label="Name" required>
              {({ id }) => <Input id={id} name="name" autoComplete="name" required />}
            </Field>
          )}
          <Field label="Email" required>
            {({ id }) => <Input id={id} name="email" type="email" autoComplete="email" required />}
          </Field>
          <Field
            label="Password"
            required
            hint={mode === 'sign-up' ? 'At least 8 characters' : undefined}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                name="password"
                type="password"
                minLength={8}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                aria-describedby={describedBy}
                required
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
