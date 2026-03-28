// features/auth/actions/new-verification.ts
'use server';

import { db } from '@/lib/db';
import { getUserByEmail } from '@/features/auth/queries/user';
import { getVerificationTokenByToken } from '@/features/auth/queries/verification-token';

export async function verifyEmailToken(token?: string | null) {
  if (!token) {
    return { error: 'Verification link is missing or invalid.' };
  }

  const existingToken = await getVerificationTokenByToken(token);
  if (!existingToken) {
    return { error: 'Verification link is invalid or has already been used.' };
  }

  if (existingToken.expires < new Date()) {
    await db.verificationToken.delete({ where: { id: existingToken.id } });
    return { error: 'Verification link has expired. Request a new one.' };
  }

  const existingUser = await getUserByEmail(existingToken.email);
  if (!existingUser?.email) {
    return { error: 'Account no longer exists for this verification link.' };
  }

  if (!existingUser.emailVerified) {
    await db.user.update({
      where: { id: existingUser.id },
      data: { emailVerified: new Date() },
    });
  }

  await db.verificationToken.delete({ where: { id: existingToken.id } });

  return {
    success: 'Your email has been verified. Your account is now active.',
  };
}
