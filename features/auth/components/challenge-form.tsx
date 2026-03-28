'use client';

import { useActionState, useEffect, useEffectEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { AlertCircle, LoaderCircle, Send, ShieldCheck } from 'lucide-react';
import {
  requestChallengeCodeAction,
  verifyChallengeCodeAction,
  type ChallengeActionState,
} from '@/features/auth/actions/challenge';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const initialState: ChallengeActionState = {};

type ChallengeFormProps = {
  next?: string;
  organizationName?: string;
};

function VerifyButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="flex-1" size="lg" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      Verify and continue
    </Button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="flex-1" size="lg" variant="outline" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
      Resend code
    </Button>
  );
}

export function ChallengeForm({ next, organizationName }: ChallengeFormProps) {
  const router = useRouter();
  const resendFormRef = useRef<HTMLFormElement>(null);
  const hasRequestedInitialCode = useRef(false);
  const [verifyState, verifyAction] = useActionState(verifyChallengeCodeAction, initialState);
  const [resendState, resendAction] = useActionState(requestChallengeCodeAction, initialState);
  const replaceRoute = useEffectEvent((target: string) => {
    router.replace(target);
  });
  const requestInitialCode = useEffectEvent(() => {
    if (hasRequestedInitialCode.current) {
      return;
    }

    hasRequestedInitialCode.current = true;
    resendFormRef.current?.requestSubmit();
  });

  useEffect(() => {
    requestInitialCode();
  }, [requestInitialCode]);

  useEffect(() => {
    const redirectTo = verifyState.redirectTo ?? resendState.redirectTo;
    if (redirectTo) {
      replaceRoute(redirectTo);
    }
  }, [replaceRoute, resendState.redirectTo, verifyState.redirectTo]);

  const serverError = verifyState.error ?? resendState.error;
  const serverSuccess = verifyState.success ?? resendState.success;

  return (
    <AuthShell
      title="Security challenge"
      description="Enter the verification code sent to your email to continue."
      organizationName={organizationName}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4 text-sm text-slate-700">
          <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <ShieldCheck className="h-4 w-4" />
            Additional verification required
          </div>
          <p className="mt-2 leading-6">
            This extra step protects sensitive access to the dashboard and account settings.
          </p>
        </div>

        <div className="space-y-5">
          <form action={verifyAction} className="space-y-5">
            <input type="hidden" name="next" value={next ?? ''} />
            <div className="space-y-2">
              <div className="relative">
                <Input
                  id="challenge-code"
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder=" "
                  className="peer pt-5"
                  required
                />
                <label
                  htmlFor="challenge-code"
                  className="pointer-events-none absolute left-4 top-1/2 origin-left -translate-y-1/2 bg-white px-1 text-sm text-slate-500 transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-0 peer-focus:text-xs peer-focus:font-medium peer-focus:text-[var(--brand)] peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium"
                >
                  Verification code
                </label>
              </div>
            </div>

            {serverError ? (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            ) : null}

            {serverSuccess ? (
              <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4 text-sm text-[var(--brand)]">
                {serverSuccess}
              </div>
            ) : null}

            <VerifyButton />
          </form>

          <form ref={resendFormRef} action={resendAction}>
            <input type="hidden" name="next" value={next ?? ''} />
            <ResendButton />
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
