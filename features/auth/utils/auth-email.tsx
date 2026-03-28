// features/auth/utils/auth-email.tsx
import * as React from 'react';
import { sendEmail } from '@/lib/email/resend';

import { TwoFactorCode } from '@/features/auth/components/emails/two-factor-code';
import { ActionEmail } from '@/features/auth/components/emails/action-email';

const CLIENT_URL = process.env.CLIENT_URL ?? process.env.NEXT_PUBLIC_CLIENT_URL ?? '';

export async function sendVerificationEmail(email: string, token: string) {
  const confirmLink = `${CLIENT_URL}/auth/activate?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    suppressReplies: true,
    react: (
      <ActionEmail
        title="Verify your email"
        lead="Click the button below to confirm your address."
        buttonLabel="Verify Email"
        url={confirmLink}
        preview="Verify your email"
      />
    ),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetLink = `${CLIENT_URL}/auth/new-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password',
    suppressReplies: true,
    react: (
      <ActionEmail
        title="Reset your password"
        lead="Click the button below to choose a new password."
        buttonLabel="Reset Password"
        url={resetLink}
        preview="Reset your password"
      />
    ),
  });
}

export async function sendTwoFactorEmail(email: string, token: string) {
  await sendEmail({
    to: email,
    subject: 'Your 2FA Code',
    suppressReplies: true,
    react: <TwoFactorCode code={token} />,
  });
}
