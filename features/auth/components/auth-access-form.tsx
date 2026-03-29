'use client';

import Link from 'next/link';
import { useActionState, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, ArrowLeft, LoaderCircle, Mail, ShieldCheck, UserPlus } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authAccessAction, type AuthAccessActionState } from '@/features/auth/actions/access';
import { requestPasswordResetAction, type ResetPasswordActionState } from '@/features/auth/actions/reset-password';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { GoogleLoginButton } from '@/features/auth/components/google-login-button';
import { loginSchema, registerSchema } from '@/features/auth/schemas/auth';

type LocalFieldErrors = Partial<Record<'email' | 'password' | 'confirmPassword' | 'code', string>>;
type LastAuthMethod = 'google' | 'credentials' | null;

const LAST_AUTH_METHOD_KEY = 'igaho:last-auth-method';
const LAST_AUTH_METHOD_EVENT = 'igaho:last-auth-method-changed';

const initialPasswordSetupState: ResetPasswordActionState = {
  values: {
    email: '',
  },
};

function readLastAuthMethod(): LastAuthMethod {
  if (typeof window === 'undefined') return null;

  const storedMethod = window.localStorage.getItem(LAST_AUTH_METHOD_KEY);
  return storedMethod === 'google' || storedMethod === 'credentials' ? storedMethod : null;
}

function subscribeToLastAuthMethod(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === LAST_AUTH_METHOD_KEY) {
      onStoreChange();
    }
  };

  const handleCustom = () => {
    onStoreChange();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(LAST_AUTH_METHOD_EVENT, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(LAST_AUTH_METHOD_EVENT, handleCustom);
  };
}

function setStoredLastAuthMethod(method: Exclude<LastAuthMethod, null>) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(LAST_AUTH_METHOD_KEY, method);
  window.dispatchEvent(new Event(LAST_AUTH_METHOD_EVENT));
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full rounded-xl" size="lg" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

function PasswordSetupButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full rounded-xl" size="lg" type="submit" variant="outline" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      Email me a link to set a password
    </Button>
  );
}

function OAuthPasswordSetupForm({ email }: { email: string }) {
  const [state, action] = useActionState(requestPasswordResetAction, initialPasswordSetupState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <PasswordSetupButton />

      {state.error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.success ? (
        <Alert className="border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--foreground)]">
          <Mail className="h-4 w-4" />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

type AuthAccessFormProps = {
  organizationName?: string;
  initialEmail?: string;
  initialMode?: AuthAccessActionState['mode'];
  initialSuccessMessage?: string;
};

export function AuthAccessForm({
  organizationName,
  initialEmail = '',
  initialMode = 'email',
  initialSuccessMessage,
}: AuthAccessFormProps) {
  const [state, action] = useActionState(authAccessAction, {
    mode: initialMode,
    fieldErrors: {},
    values: {
      email: initialEmail,
      code: '',
    },
    success: initialSuccessMessage,
  });

  const [localErrors, setLocalErrors] = useState<LocalFieldErrors>({});
  const [modeOverride, setModeOverride] = useState<AuthAccessActionState['mode'] | null>(null);

  const lastAuthMethod = useSyncExternalStore(
    subscribeToLastAuthMethod,
    readLastAuthMethod,
    () => null,
  );

  const mode = modeOverride ?? state.mode ?? 'email';
  const emailValue = state.values?.email ?? '';
  const isEmailStep = mode === 'email';
  const isLoginStep = mode === 'login';
  const isRegisterStep = mode === 'register';
  const isOauthStep = mode === 'oauth';
  const twoFactorRequired = state.twoFactorRequired ?? false;

  const fieldErrors = {
    email: localErrors.email ?? state.fieldErrors?.email,
    password: localErrors.password ?? state.fieldErrors?.password,
    confirmPassword: localErrors.confirmPassword ?? state.fieldErrors?.confirmPassword,
    code: localErrors.code ?? state.fieldErrors?.code,
  };

  const registrationComplete = isRegisterStep && Boolean(state.success) && !state.error;
  const statusMessage =
    state.success ?? (twoFactorRequired && !state.error ? 'A verification code has been sent to your email.' : '');

  const inputErrorClass =
    'border-rose-300 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.12)]';

  return (
    <AuthShell
      title="Enter your email address"
      description=""
      footerText="Need a different path?"
      footerLinkHref="/auth/reset"
      footerLinkLabel="Reset password"
      organizationName={organizationName}
    >
      {lastAuthMethod ? (
        <div className="mb-4 flex items-center justify-start">
          <Badge variant="outline" className="rounded-full border-slate-300 bg-slate-50 px-3 py-1 text-slate-600">
            Last used: {lastAuthMethod === 'google' ? 'Google' : 'Password'}
          </Badge>
        </div>
      ) : null}

      <form
        className="space-y-5"
        action={action}
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);

          if (isEmailStep) {
            const email = String(formData.get('email') ?? '').trim();
            const parsed = loginSchema.pick({ email: true }).safeParse({ email });

            if (!parsed.success) {
              event.preventDefault();
              const fields = parsed.error.flatten().fieldErrors;
              setLocalErrors({
                email: fields.email?.[0] ?? 'Enter a valid email address.',
              });
              return;
            }
          }

          if (isLoginStep) {
            const values = {
              email: emailValue,
              password: String(formData.get('password') ?? ''),
              code: String(formData.get('code') ?? ''),
            };

            const parsed = loginSchema.safeParse(values);

            if (!parsed.success) {
              event.preventDefault();
              const fields = parsed.error.flatten().fieldErrors;
              setLocalErrors({
                email: fields.email?.[0],
                password: fields.password?.[0],
                code: fields.code?.[0],
              });
              return;
            }
          }

          if (isRegisterStep && !registrationComplete) {
            const values = {
              email: emailValue,
              password: String(formData.get('password') ?? ''),
              confirmPassword: String(formData.get('confirmPassword') ?? ''),
            };

            const parsed = registerSchema.safeParse(values);

            if (!parsed.success) {
              event.preventDefault();
              const fields = parsed.error.flatten().fieldErrors;
              setLocalErrors({
                email: fields.email?.[0],
                password: fields.password?.[0],
                confirmPassword: fields.confirmPassword?.[0],
              });
              return;
            }
          }

          if (!isEmailStep) {
            setStoredLastAuthMethod('credentials');
          }

          setLocalErrors({});
          setModeOverride(null);
        }}
      >
        <input
          type="hidden"
          name="intent"
          value={isEmailStep ? 'resolve' : isLoginStep ? 'login' : isRegisterStep ? 'register' : 'change-email'}
        />

        {isEmailStep ? (
          <Field>
            <FieldLabel htmlFor="email" required>
              Email address
            </FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={emailValue}
              className={fieldErrors.email ? inputErrorClass : undefined}
              onChange={() => {
                if (localErrors.email) {
                  setLocalErrors((current) => ({ ...current, email: undefined }));
                }
              }}
              required
            />
            <FieldError>{fieldErrors.email}</FieldError>
          </Field>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Email</p>
                <p className="mt-1 truncate text-sm font-medium text-slate-900">{emailValue}</p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setModeOverride('email');
                  setLocalErrors({});
                }}
                className="shrink-0"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Change
              </Button>
            </div>

            <input type="hidden" name="email" value={emailValue} />
          </div>
        )}

        {isLoginStep ? (
          <>
            <Alert className="border-slate-200 bg-white">
              <Mail className="h-4 w-4" />
              <AlertTitle>Account found</AlertTitle>
              <AlertDescription>
                Enter your password to continue. If you normally use Google, you can also continue with Google below.
              </AlertDescription>
            </Alert>

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password" required>
                  Password
                </FieldLabel>
                <Link href="/auth/reset" className="text-sm font-semibold text-[var(--brand)] hover:opacity-85">
                  Forgot password?
                </Link>
              </div>

              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className={fieldErrors.password ? inputErrorClass : undefined}
                onChange={() => {
                  if (localErrors.password) {
                    setLocalErrors((current) => ({ ...current, password: undefined }));
                  }
                }}
                required
              />
              <FieldError>{fieldErrors.password}</FieldError>
            </Field>

            {twoFactorRequired ? (
              <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <ShieldCheck className="h-4 w-4" />
                  Two-factor verification
                </div>

                <p className="text-sm leading-6 text-slate-700">
                  Enter the code from your email to complete the sign-in process.
                </p>

                <Field>
                  <FieldLabel htmlFor="code">Verification code</FieldLabel>
                  <Input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    defaultValue={state.values?.code ?? ''}
                    className={fieldErrors.code ? inputErrorClass : undefined}
                    onChange={() => {
                      if (localErrors.code) {
                        setLocalErrors((current) => ({ ...current, code: undefined }));
                      }
                    }}
                  />
                  <FieldError>{fieldErrors.code}</FieldError>
                </Field>
              </div>
            ) : null}

            <SubmitButton>Sign in</SubmitButton>
          </>
        ) : null}

        {isRegisterStep ? (
          registrationComplete ? (
            <div className="space-y-4">
              <Alert className="border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--foreground)]">
                <Mail className="h-4 w-4" />
                <AlertTitle>Check your email</AlertTitle>
                <AlertDescription>{state.success}</AlertDescription>
              </Alert>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href={`/auth/verify-email?email=${encodeURIComponent(emailValue)}`}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Resend link
                </Link>

                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setModeOverride('email');
                    setLocalErrors({});
                  }}
                >
                  Use another email
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Alert className="border-slate-200 bg-white">
                <UserPlus className="h-4 w-4" />
                <AlertTitle>New email</AlertTitle>
                <AlertDescription>Create a password and we will register your account.</AlertDescription>
              </Alert>

              <Field>
                <FieldLabel htmlFor="password" required>
                  Password
                </FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  className={fieldErrors.password ? inputErrorClass : undefined}
                  onChange={() => {
                    if (localErrors.password || localErrors.confirmPassword) {
                      setLocalErrors((current) => ({
                        ...current,
                        password: undefined,
                        confirmPassword: undefined,
                      }));
                    }
                  }}
                  required
                />
                <FieldDescription>Use at least 8 characters with upper, lower, number, and symbol.</FieldDescription>
                <FieldError>{fieldErrors.password}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword" required>
                  Confirm password
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  className={fieldErrors.confirmPassword ? inputErrorClass : undefined}
                  onChange={() => {
                    if (localErrors.confirmPassword) {
                      setLocalErrors((current) => ({ ...current, confirmPassword: undefined }));
                    }
                  }}
                  required
                />
                <FieldError>{fieldErrors.confirmPassword}</FieldError>
              </Field>

              <SubmitButton>Create account</SubmitButton>
            </>
          )
        ) : null}

        {isOauthStep ? (
          <Alert className="border-slate-200 bg-white">
            <Mail className="h-4 w-4" />
            <AlertTitle>Google sign-in found for this email</AlertTitle>
            <AlertDescription>
              This account does not have a saved password yet. Continue with Google below, or email yourself a secure
              link to add a password.
            </AlertDescription>
          </Alert>
        ) : null}

        {isEmailStep ? <SubmitButton>Continue</SubmitButton> : null}

        {state.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        {statusMessage && !registrationComplete ? (
          <Alert className="border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--foreground)]">
            <Mail className="h-4 w-4" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      {isOauthStep ? <OAuthPasswordSetupForm email={emailValue} /> : null}

      {!registrationComplete ? (
        <>
          <div className="flex items-center gap-4 py-1">
            <div className="h-px flex-1 bg-slate-200/80" />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-slate-200/80" />
          </div>

          <GoogleLoginButton />
        </>
      ) : null}
    </AuthShell>
  );
}