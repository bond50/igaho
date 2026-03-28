'use server';

import * as z from 'zod';
import { resetSchema } from '@/features/auth/schemas/auth';
import { getUserByEmail } from '@/features/auth/queries/user';
import { generatePasswordResetToken } from '@/features/auth/queries/tokens';
import { sendPasswordResetEmail } from '@/features/auth/utils/auth-email';

const GENERIC_SUCCESS = 'If an account exists for that email, a reset link has been sent.';

export type ResetPasswordActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<'email', string>>;
  values?: {
    email?: string;
  };
};

function getResetFieldErrors(error: z.ZodError<z.infer<typeof resetSchema>>) {
  const fields = error.flatten().fieldErrors;

  return {
    email: fields.email?.[0],
  } satisfies ResetPasswordActionState['fieldErrors'];
}

export async function requestPasswordReset(values: z.infer<typeof resetSchema>) {
  const parsed = resetSchema.safeParse(values);
  if (!parsed.success) {
    return { error: 'Invalid email address.' };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (!user?.email) {
    return { success: GENERIC_SUCCESS };
  }

  const resetToken = await generatePasswordResetToken(normalizedEmail);
  await sendPasswordResetEmail(resetToken.email, resetToken.token);

  return { success: GENERIC_SUCCESS };
}

export async function requestPasswordResetAction(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const values = {
    email: String(formData.get('email') ?? ''),
  };

  const parsed = resetSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: getResetFieldErrors(parsed.error),
      values,
    };
  }

  const result = await requestPasswordReset(parsed.data);

  return {
    error: result.error,
    success: result.success,
    values: result.error ? values : { email: '' },
  };
}
