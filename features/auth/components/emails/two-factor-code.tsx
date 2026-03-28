// features/auth/components/emails/two-factor-code.tsx
import type { CSSProperties } from 'react';
import * as React from 'react';
import { Heading, Text } from '@react-email/components';
import { BaseEmail } from '@/components/emails/base-email';

export function TwoFactorCode({ code }: { code: string }) {
  return (
    <BaseEmail preview="Your 2FA Code">
      <Heading style={styles.h1}>Your 2FA Code</Heading>
      <Text style={styles.p}>Use this code to complete your sign in:</Text>
      <Text style={styles.code}>{code}</Text>
      <Text style={{ ...styles.p, color: '#555' }}>
        This code expires soon. If you didn’t request it, ignore this email.
      </Text>
    </BaseEmail>
  );
}

const styles: Record<string, CSSProperties> = {
  h1: { fontSize: 24, margin: 0 },
  p: { fontSize: 14, lineHeight: '22px' },
  code: {
    fontSize: 22,
    letterSpacing: 3,
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    display: 'inline-block',
    background: '#fafafa',
  },
};
