// features/auth/components/emails/action-email.tsx
import type { CSSProperties } from 'react';
import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { BaseEmail } from '@/components/emails/base-email';

export function ActionEmail({
  title,
  lead,
  buttonLabel,
  url,
  preview,
}: {
  title: string;
  lead: string;
  buttonLabel: string;
  url: string;
  preview: string;
}) {
  return (
    <BaseEmail preview={preview}>
      <Heading style={styles.h1}>{title}</Heading>
      <Text style={styles.p}>{lead}</Text>
      <Section style={styles.center}>
        <Button href={url} style={styles.btn}>
          {buttonLabel}
        </Button>
      </Section>
      <Text style={{ ...styles.p, color: '#555' }}>
        If you didn’t request this, you can ignore this email.
      </Text>
    </BaseEmail>
  );
}

const styles: Record<string, CSSProperties> = {
  h1: { fontSize: 24, margin: 0 },
  p: { fontSize: 14, lineHeight: '22px' },
  center: { textAlign: 'center' as const, margin: '24px 0' },
  btn: {
    display: 'inline-block',
    padding: '12px 16px',
    backgroundColor: '#111',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: 6,
  },
};
