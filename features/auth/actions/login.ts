'use server';

import * as z from 'zod';
import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { DEFAULT_LOGIN_REDIRECT, mfaRoute } from '@/routes';

import { loginSchema } from '@/features/auth/schemas/auth';
import { db } from '@/lib/db';
import { generateTwoFactorToken, generateVerificationToken } from '@/features/auth/queries/tokens';
import { sendTwoFactorEmail, sendVerificationEmail } from '@/features/auth/utils/auth-email';
import {
  assertNotRateLimited2FA,
  assertNotRateLimitedLogin,
  clearLoginLockOnSuccess,
} from '@/features/auth/utils/rate-limit';
import { getUserByEmail } from '@/features/auth/queries/user';
import { getTwoFactorTokenByToken } from '@/features/auth/queries/two-factor-token';
import { getTwoFactorConfirmationByUserId } from '@/features/auth/queries/two-factor-confirmation';

const GENERIC = 'Invalid email or password';

export type LoginResult = {
  error?: string;
  success?: string;
  twoFactorRequired?: boolean;
  lockMs?: number;
};

export type LoginActionState = {
  error?: string;
  success?: string;
  twoFactorRequired?: boolean;
  fieldErrors?: Partial<Record<'email' | 'password' | 'code', string>>;
  values?: {
    email?: string;
    code?: string;
  };
};

function formatLockDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return 'a moment';

  const totalSeconds = Math.ceil(ms / 1000);
  const totalMinutes = Math.ceil(totalSeconds / 60);
  const oneHour = 60;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;

  if (totalMinutes <= 1) return '1 minute';
  if (totalMinutes < oneHour) return `${totalMinutes} minutes`;

  const hours = Math.round(totalMinutes / oneHour);
  if (totalMinutes < oneDay) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = Math.round(totalMinutes / oneDay);
  if (totalMinutes < oneWeek) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const weeks = Math.round(totalMinutes / oneWeek);
  return `${weeks} week${weeks === 1 ? '' : 's'}`;
}

function getLoginFieldErrors(error: z.ZodError<z.infer<typeof loginSchema>>) {
  const fields = error.flatten().fieldErrors;

  return {
    email: fields.email?.[0],
    password: fields.password?.[0],
    code: fields.code?.[0],
  } satisfies LoginActionState['fieldErrors'];
}

export const login = async (values: z.infer<typeof loginSchema>): Promise<LoginResult> => {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { error: 'Invalid fields' };

  const { email, password, code } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    await assertNotRateLimitedLogin(normalizedEmail);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('rate_limited')) {
      const parts = e.message.split(':');
      const raw = parts[1];
      const remainingMs = raw && raw.trim().length > 0 ? Number.parseInt(raw.trim(), 10) : undefined;
      const friendly = formatLockDuration(remainingMs ?? null);

      return {
        error: `Too many attempts. Please try again in ${friendly}.`,
        lockMs: remainingMs && Number.isFinite(remainingMs) ? remainingMs : undefined,
      };
    }

    return { error: GENERIC };
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user?.email || !user.password) {
    await new Promise((r) => setTimeout(r, 300));
    return { error: GENERIC };
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 300));
    return { error: GENERIC };
  }

  if (!user.emailVerified) {
    const verificationToken = await generateVerificationToken(user.email);
    await sendVerificationEmail(verificationToken.email, verificationToken.token);
    return { success: 'Check your email to verify your account.' };
  }

  if (user.isTwoFAEnabled) {
    if (!code) {
      try {
        await assertNotRateLimited2FA(user.email);
      } catch {
        return {
          error: 'Too many verification codes requested. Try again shortly.',
        };
      }

      const token = await generateTwoFactorToken(user.email);
      await sendTwoFactorEmail(user.email, token.token);
      return { twoFactorRequired: true };
    }

    const existingToken = await getTwoFactorTokenByToken(code);
    if (!existingToken || existingToken.email !== user.email || existingToken.expires < new Date()) {
      return { error: 'Invalid or expired 2FA code' };
    }

    await db.twoFactorToken.delete({ where: { id: existingToken.id } });
    const prior = await getTwoFactorConfirmationByUserId(user.id);
    if (prior) {
      await db.twoFactorConfirmation.delete({ where: { id: prior.id } });
    }
    await db.twoFactorConfirmation.create({ data: { userId: user.id } });
  }

  await clearLoginLockOnSuccess(normalizedEmail);

  const requiresChallenge = user.role === 'ADMIN' || Boolean(user.isTwoFAEnabled);
  const redirectTarget = requiresChallenge
    ? `${mfaRoute}?next=${encodeURIComponent(DEFAULT_LOGIN_REDIRECT)}`
    : DEFAULT_LOGIN_REDIRECT;

  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: redirectTarget,
    });
    return { success: 'Login successful!' };
  } catch (e) {
    if (e instanceof AuthError) return { error: GENERIC };
    throw e;
  }
};

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const values = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    code: String(formData.get('code') ?? ''),
  };

  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: getLoginFieldErrors(parsed.error),
      values: {
        email: values.email,
        code: values.code,
      },
      twoFactorRequired: values.code.trim().length > 0,
    };
  }

  const result = await login(parsed.data);

  return {
    error: result.error,
    success: result.success,
    twoFactorRequired: result.twoFactorRequired ?? ((parsed.data.code?.trim()?.length ?? 0) > 0),
    values: {
      email: parsed.data.email,
      code: parsed.data.code ?? '',
    },
  };
}

