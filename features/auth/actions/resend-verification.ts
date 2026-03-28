'use server';

import * as z from 'zod';
import { resetSchema } from '@/features/auth/schemas/auth';
import { getUserByEmail } from '@/features/auth/queries/user';
import { generateVerificationToken } from '@/features/auth/queries/tokens';
import { sendVerificationEmail } from '@/features/auth/utils/auth-email';

const GENERIC_SUCCESS = 'If the account needs verification, a new activation link has been sent.';

export type VerifyEmailActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<'email', string>>;
  values?: {
    email?: string;
  };
};

function getVerifyFieldErrors(error: z.ZodError<z.infer<typeof resetSchema>>) {
  const fields = error.flatten().fieldErrors;

  return {
    email: fields.email?.[0],
  } satisfies VerifyEmailActionState['fieldErrors'];
}

export async function resendVerificationEmail(values: z.infer<typeof resetSchema>) {
  const parsed = resetSchema.safeParse(values);
  if (!parsed.success) {
    return { error: 'Invalid email address.' };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (!user?.email || user.emailVerified) {
    return { success: GENERIC_SUCCESS };
  }

  const verificationToken = await generateVerificationToken(normalizedEmail);
  await sendVerificationEmail(verificationToken.email, verificationToken.token);

  return { success: GENERIC_SUCCESS };
}

export async function resendVerificationEmailAction(
  _previousState: VerifyEmailActionState,
  formData: FormData,
): Promise<VerifyEmailActionState> {
  const values = {
    email: String(formData.get('email') ?? ''),
  };

  const parsed = resetSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: getVerifyFieldErrors(parsed.error),
      values,
    };
  }

  const result = await resendVerificationEmail(parsed.data);

  return {
    error: result.error,
    success: result.success,
    values,
  };
}
