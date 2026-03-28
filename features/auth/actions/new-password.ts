'use server';

import * as z from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { newPasswordSchema } from '@/features/auth/schemas/auth';
import { getUserByEmail } from '@/features/auth/queries/user';
import { getPasswordResetTokenByToken } from '@/features/auth/queries/password-reset-token';

export type NewPasswordActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<'password' | 'confirmPassword', string>>;
};

function getNewPasswordFieldErrors(error: z.ZodError<z.infer<typeof newPasswordSchema>>) {
  const fields = error.flatten().fieldErrors;

  return {
    password: fields.password?.[0],
    confirmPassword: fields.confirmPassword?.[0],
  } satisfies NewPasswordActionState['fieldErrors'];
}

export async function resetPasswordWithToken(
  values: z.infer<typeof newPasswordSchema>,
  token?: string | null,
) {
  const parsed = newPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return { error: 'Invalid password fields.' };
  }

  if (!token) {
    return { error: 'Reset link is missing or invalid.' };
  }

  const existingToken = await getPasswordResetTokenByToken(token);
  if (!existingToken) {
    return { error: 'Reset link is invalid or has already been used.' };
  }

  if (existingToken.expires < new Date()) {
    await db.passwordResetToken.delete({ where: { id: existingToken.id } });
    return { error: 'Reset link has expired. Request a new one.' };
  }

  const existingUser = await getUserByEmail(existingToken.email);
  if (!existingUser?.email) {
    return { error: 'Account no longer exists for this reset link.' };
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

  await db.user.update({
    where: { id: existingUser.id },
    data: { password: hashedPassword },
  });

  await db.passwordResetToken.delete({ where: { id: existingToken.id } });

  return { success: 'Password updated. You can sign in with your new password now.' };
}

export async function resetPasswordWithTokenAction(
  token: string | null | undefined,
  _previousState: NewPasswordActionState,
  formData: FormData,
): Promise<NewPasswordActionState> {
  const values = {
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  };

  const parsed = newPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: getNewPasswordFieldErrors(parsed.error),
    };
  }

  const result = await resetPasswordWithToken(parsed.data, token);

  return {
    error: result.error,
    success: result.success,
  };
}
