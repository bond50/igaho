import { nanoid } from 'nanoid';
import * as crypto from 'crypto';

import { db } from '@/lib/db';
import { getPasswordResetTokenByEmail } from '@/features/auth/queries/password-reset-token';
import { getVerificationTokenByEmail } from '@/features/auth/queries/verification-token';

export const generateTwoFactorToken = async (email: string) => {
  const token = crypto.randomInt(100_000, 999_999).toString().padStart(6, '0');
  const expires = new Date(new Date().getTime() + 5 * 60 * 1000);

  await db.twoFactorToken.deleteMany({
    where: {
      email,
    },
  });

  return db.twoFactorToken.create({
    data: {
      email,
      token,
      expires,
    },
  });
};

export const generatePasswordResetToken = async (email: string) => {
  const token = nanoid(32);
  const expires = new Date(new Date().getTime() + 60 * 60 * 1000);

  const existingToken = await getPasswordResetTokenByEmail(email);
  if (existingToken) {
    await db.passwordResetToken.delete({
      where: {
        id: existingToken.id,
      },
    });
  }

  return db.passwordResetToken.create({
    data: {
      email,
      token,
      expires,
    },
  });
};

export const generateVerificationToken = async (email: string) => {
  const token = nanoid(32);
  const expires = new Date(new Date().getTime() + 15 * 60 * 1000);

  const existingToken = await getVerificationTokenByEmail(email);
  if (existingToken) {
    await db.verificationToken.delete({
      where: {
        id: existingToken.id,
      },
    });
  }

  return db.verificationToken.create({
    data: {
      email,
      token,
      expires,
    },
  });
};
