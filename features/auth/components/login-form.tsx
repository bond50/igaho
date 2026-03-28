'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, LoaderCircle, ShieldCheck } from 'lucide-react';
import { loginAction, type LoginActionState } from '@/features/auth/actions/login';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleLoginButton } from '@/features/auth/components/google-login-button';
import { PasswordInput } from '@/features/auth/components/password-input';
import { FloatingInput } from '@/features/auth/components/floating-input';

const initialState: LoginActionState = {
  fieldErrors: {},
  values: {
    email: '',
    code: '',
  },
};

function SubmitButton({ twoFactorRequired }: { twoFactorRequired: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full rounded-xl" size="lg" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      {twoFactorRequired ? 'Verify and continue' : 'Sign in'}
    </Button>
  );
}

type LoginFormProps = {
  organizationName?: string;
};

export function LoginForm({ organizationName }: LoginFormProps) {
  const [state, action] = useActionState(loginAction, initialState);
  const twoFactorRequired = state.twoFactorRequired ?? false;
  const statusMessage = state.success ?? (twoFactorRequired && !state.error ? 'A verification code has been sent to your email.' : '');

  return (
    <AuthShell
      title="Sign in to your account"
      description="Use your email and password to continue."
      footerText="Not registered yet?"
      footerLinkHref="/auth/register"
      footerLinkLabel="Create an account"
      organizationName={organizationName}
    >
      <form className="space-y-5" action={action}>
        <FloatingInput
          id="email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email ?? ''}
          error={state.fieldErrors?.email}
          required
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <Link href="/auth/reset" className="text-sm font-semibold text-[var(--brand)] hover:opacity-85">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            label="Password"
            autoComplete="current-password"
            error={state.fieldErrors?.password}
            containerClassName="space-y-0"
            required
          />
        </div>

        {twoFactorRequired ? (
          <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <ShieldCheck className="h-4 w-4" />
              Two-factor verification
            </div>
            <p className="text-sm leading-6 text-slate-700">
              Enter the code from your email to complete the sign-in process.
            </p>
            <div className="space-y-2">
              <div className="relative">
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder=" "
                  defaultValue={state.values?.code ?? ''}
                  className="peer pt-5"
                />
                <label
                  htmlFor="code"
                  className="pointer-events-none absolute left-4 top-1/2 origin-left -translate-y-1/2 bg-[var(--brand-soft)] px-1 text-sm text-slate-500 transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-0 peer-focus:text-xs peer-focus:font-medium peer-focus:text-[var(--brand)] peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium"
                >
                  Verification code
                </label>
              </div>
            </div>
            {state.fieldErrors?.code ? <p className="text-sm text-red-600">{state.fieldErrors.code}</p> : null}
          </div>
        ) : null}

        {state.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4 text-sm text-[var(--brand)]">
            {statusMessage}
          </div>
        ) : null}

        <SubmitButton twoFactorRequired={twoFactorRequired} />
      </form>

      <div className="flex items-center gap-4 py-1">
        <div className="h-px flex-1 bg-slate-200/80" />
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
          Or continue with
        </span>
        <div className="h-px flex-1 bg-slate-200/80" />
      </div>

      <GoogleLoginButton />
    </AuthShell>
  );
}

