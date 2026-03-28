'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, LoaderCircle, MailCheck } from 'lucide-react';
import {
  resendVerificationEmailAction,
  type VerifyEmailActionState,
} from '@/features/auth/actions/resend-verification';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { FloatingInput } from '@/features/auth/components/floating-input';
import { Button } from '@/components/ui/button';

type VerifyEmailFormProps = {
  initialEmail?: string;
  organizationName?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" size="lg" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}
      Resend activation link
    </Button>
  );
}

export function VerifyEmailForm({ initialEmail = '', organizationName }: VerifyEmailFormProps) {
  const initialState: VerifyEmailActionState = {
    fieldErrors: {},
    values: { email: initialEmail },
  };

  const [state, action] = useActionState(resendVerificationEmailAction, initialState);

  return (
    <AuthShell
      title="Verify your email"
      description="Check your inbox for the activation link. You can request a fresh one below."
      footerText="Already verified?"
      footerLinkHref="/auth/login"
      footerLinkLabel="Sign in"
      organizationName={organizationName}
    >
      <form className="space-y-5" action={action}>
        <FloatingInput
          id="verify-email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email ?? initialEmail}
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

