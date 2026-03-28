'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, LoaderCircle, Mail } from 'lucide-react';
import {
  requestPasswordResetAction,
  type ResetPasswordActionState,
} from '@/features/auth/actions/reset-password';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { FloatingInput } from '@/features/auth/components/floating-input';
import { Button } from '@/components/ui/button';

const initialState: ResetPasswordActionState = {
  fieldErrors: {},
  values: { email: '' },
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" size="lg" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
      Send reset link
    </Button>
  );
}

type ResetPasswordFormProps = {
  organizationName?: string;
};

export function ResetPasswordForm({ organizationName }: ResetPasswordFormProps) {
  const [state, action] = useActionState(requestPasswordResetAction, initialState);

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email address and we will send you a secure reset link."
      footerText="Remembered your password?"
      footerLinkHref="/auth/login"
      footerLinkLabel="Back to sign in"
      organizationName={organizationName}
    >
      <form className="space-y-5" action={action}>
        <FloatingInput
          id="reset-email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email ?? ''}
          error={state.fieldErrors?.email}
          required
        />

        {state.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        {state.success ? (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4 text-sm text-[var(--brand)]">
            {state.success}
          </div>
        ) : null}

        <SubmitButton />
      </form>
    </AuthShell>
  );
}

