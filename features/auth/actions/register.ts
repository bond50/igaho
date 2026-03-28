'use server';

import * as z from 'zod';
import { registerSchema } from '@/features/auth/schemas/auth';
import { registerUser } from '@/features/auth/lib/register-user';

export type RegisterActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<'email' | 'password' | 'confirmPassword', string>>;
  values?: {
    email?: string;
  };
};

function getRegisterFieldErrors(
  error: z.ZodError<z.infer<typeof registerSchema>>,
  values?: { email?: string; password?: string; confirmPassword?: string },
) {
  const fields = error.flatten().fieldErrors;

  return {
    email: fields.email?.[0] ?? (!values?.email ? 'Email is required' : undefined),
    password: fields.password?.[0] ?? (!values?.password ? 'Password is required' : undefined),
    confirmPassword:
      fields.confirmPassword?.[0] ?? (!values?.confirmPassword ? 'Please confirm your password' : undefined),
  } satisfies RegisterActionState['fieldErrors'];
}

export async function registerAction(
  _previousState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const values = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  };

  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: getRegisterFieldErrors(parsed.error, values),
      values: {
        email: values.email,
      },
    };
  }

  const result = await registerUser(parsed.data);

  return {
    error: result?.error,
    success: result?.success,
    values: {
      email: parsed.data.email,
    },
  };
}
