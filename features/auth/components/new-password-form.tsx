'use client';

import Link from 'next/link';
import { useActionState, useEffect, useEffectEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import {
  resetPasswordWithTokenAction,
  type NewPasswordActionState,
} from '@/features/auth/actions/new-password';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { PasswordInput } from '@/features/auth/components/password-input';
import { Button } from '@/components/ui/button';

type NewPasswordFormProps = {
  token?: string;
  email?: string;
  organizationName?: string;
};

const initialState: NewPasswordActionState = {
  fieldErrors: {},
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" size="lg" type="submit" disabled={pending || disabled}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      Update password
    </Button>
  );
}

export function NewPasswordForm({ token, email = '', organizationName }: NewPasswordFormProps) {
  const router = useRouter();
  const actionWithToken = resetPasswordWithTokenAction.bind(null, token);
  const [state, action] = useActionState(actionWithToken, initialState);
  const redirectToLogin = useEffectEvent(() => {
    router.push('/auth/login');
  });

  useEffect(() => {
    if (!state.success) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      redirectToLogin();
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [state.success, redirectToLogin]);

  return (
    <AuthShell
      title="Choose a new password"
      description="Set a new password for your account, then return to sign in."
      footerText="Need a new reset link?"
      footerLinkHref="/auth/reset"
      footerLinkLabel="Request one"
      organizationName={organizationName}
    >
      <form className="space-y-5" action={action}>
        <input
          type="email"
          name="email"
          autoComplete="username"
          defaultValue={email}
          className="hidden"
          readOnly
          tabIndex={-1}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordInput
            id="new-password"
            name="password"
            label="New password"
            autoComplete="new-password"
            error={state.fieldErrors?.password}
            description="Use at least 8 characters with upper, lower, number, and symbol."
            required
          />

          <PasswordInput
            id="confirm-new-password"
            name="confirmPassword"
            label="Confirm password"
            autoComplete="new-password"
            error={state.fieldErrors?.confirmPassword}
            required
          />
        </div>

        {state.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        {state.success ? (
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.success}</span>
          </div>
        ) : null}

        <SubmitButton disabled={!token} />

        {!token ? (
          <p className="text-sm text-slate-600">
            This reset link is missing a token.{' '}
            <Link className="font-semibold text-[var(--brand)]" href="/auth/reset">
              Request a new reset email.
            </Link>
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
