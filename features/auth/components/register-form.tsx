'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, LoaderCircle, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { registerAction, type RegisterActionState } from '@/features/auth/actions/register';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { GoogleLoginButton } from '@/features/auth/components/google-login-button';
import { registerSchema } from '@/features/auth/schemas/auth';

const initialState: RegisterActionState = {
  fieldErrors: {},
  values: {
    email: '',
  },
};

type LocalFieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full rounded-xl" size="lg" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
      Create account
    </Button>
  );
}

type RegisterFormProps = {
  organizationName?: string;
};

export function RegisterForm({ organizationName }: RegisterFormProps) {
  const [state, action] = useActionState(registerAction, initialState);
  const [localErrors, setLocalErrors] = useState<LocalFieldErrors>({});

  useEffect(() => {
    if (state.fieldErrors?.email || state.fieldErrors?.password || state.fieldErrors?.confirmPassword) {
      setLocalErrors({
        email: state.fieldErrors.email,
        password: state.fieldErrors.password,
        confirmPassword: state.fieldErrors.confirmPassword,
      });
    }
  }, [state.fieldErrors]);

  const fieldErrors = {
    email: localErrors.email ?? state.fieldErrors?.email,
    password: localErrors.password ?? state.fieldErrors?.password,
    confirmPassword: localErrors.confirmPassword ?? state.fieldErrors?.confirmPassword,
  };

  return (
    <AuthShell
      title="Create your account"
      description="Create your login, verify your email, then complete your member profile before starting the application."
      footerText="Already have an account?"
      footerLinkHref="/auth/login"
      footerLinkLabel="Sign in"
      organizationName={organizationName}
    >
      <form
        className="space-y-5"
        action={action}
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          const values = {
            email: String(formData.get('email') ?? ''),
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

          setLocalErrors({});
        }}
      >
        <Field>
          <FieldLabel htmlFor="email" required>Email address</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email ?? ''}
            className={fieldErrors.email ? 'border-rose-300 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.12)]' : undefined}
            onChange={() => {
              if (localErrors.email) {
                setLocalErrors((current) => ({ ...current, email: undefined }));
              }
            }}
            required
          />
          <FieldError>{fieldErrors.email}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="password" required>Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className={fieldErrors.password ? 'border-rose-300 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.12)]' : undefined}
            onChange={() => {
              if (localErrors.password || localErrors.confirmPassword) {
                setLocalErrors((current) => ({ ...current, password: undefined, confirmPassword: undefined }));
              }
            }}
            required
          />
          <FieldDescription>Use at least 8 characters with upper, lower, number, and symbol.</FieldDescription>
          <FieldError>{fieldErrors.password}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirmPassword" required>Confirm password</FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={fieldErrors.confirmPassword ? 'border-rose-300 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.12)]' : undefined}
            onChange={() => {
              if (localErrors.confirmPassword) {
                setLocalErrors((current) => ({ ...current, confirmPassword: undefined }));
              }
            }}
            required
          />
          <FieldError>{fieldErrors.confirmPassword}</FieldError>
        </Field>

        {state.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <SubmitButton />
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
