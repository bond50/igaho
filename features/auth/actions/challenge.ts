'use server';

import { auth, unstable_update } from '@/auth';
import { getTwoFactorTokenByToken } from '@/features/auth/queries/two-factor-token';
import { getUserById } from '@/features/auth/queries/user';
import { generateTwoFactorToken } from '@/features/auth/queries/tokens';
import { sendTwoFactorEmail } from '@/features/auth/utils/auth-email';
import { assertNotRateLimited2FA } from '@/features/auth/utils/rate-limit';
import { db } from '@/lib/db';

export type ChallengeActionState = {
  error?: string;
  success?: string;
  redirectTo?: string;
};

type ChallengeInput = {
  code?: string;
  next?: string;
};

function normalizeNext(next?: string): string {
  if (typeof next !== 'string' || !next.startsWith('/')) {
    return '/dashboard';
  }

  return next;
}

export async function submitChallenge(values: ChallengeInput) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Your session has expired. Sign in again.' };
  }

  const user = await getUserById(session.user.id);
  if (!user?.email) {
    return { error: 'Unable to find your account. Sign in again.' };
  }

  const next = normalizeNext(values.next);
  const code = values.code?.trim();

  if (!code) {
    try {
      await assertNotRateLimited2FA(user.email);
    } catch {
      return { error: 'Too many verification codes requested. Try again shortly.' };
    }

    const token = await generateTwoFactorToken(user.email);
    await sendTwoFactorEmail(user.email, token.token);

    return { success: 'A verification code has been sent to your email.' };
  }

  const existingToken = await getTwoFactorTokenByToken(code);
  if (!existingToken || existingToken.email !== user.email || existingToken.expires < new Date()) {
    return { error: 'Invalid or expired verification code.' };
  }

  await db.twoFactorToken.delete({ where: { id: existingToken.id } });
  await unstable_update({ mfaVerified: true });

  return {
    success: 'Verification complete.',
    redirectTo: next,
  };
}

export async function requestChallengeCodeAction(
  _previousState: ChallengeActionState,
  formData: FormData,
): Promise<ChallengeActionState> {
  const next = String(formData.get('next') ?? '');
  return submitChallenge({ next });
}

export async function verifyChallengeCodeAction(
  _previousState: ChallengeActionState,
  formData: FormData,
): Promise<ChallengeActionState> {
  const next = String(formData.get('next') ?? '');
  const code = String(formData.get('code') ?? '');
  return submitChallenge({ next, code });
}
