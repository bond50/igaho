// components/emails/contact-request-email.tsx
import type { CSSProperties } from 'react';
import * as React from 'react';
import { Heading, Text } from '@react-email/components';
import { BaseEmail } from '@/components/emails/base-email';

type Props = {
  name: string;
  email?: string | null;
  phone?: string | null;
  wardName?: string | null;
  subject: string;
  details: string;
};

export function ContactRequestEmail({ name, email, phone, wardName, subject, details }: Props) {
  return (
    <BaseEmail preview={`New contact request: ${subject}`}>
      <Heading style={styles.h1}>New Contact Request</Heading>

      <Text style={styles.p}>You received a new message from the public contact form.</Text>

      <Text style={styles.p}>
        <strong>Subject:</strong> {subject}
      </Text>

      <Text style={styles.p}>
        <strong>From:</strong> {name || 'Anonymous'}
        {email ? ` <${email}>` : ''}
      </Text>

      {phone && (
        <Text style={styles.p}>
          <strong>Phone:</strong> {phone}
        </Text>
      )}

      {wardName && (
        <Text style={styles.p}>
          <strong>Ward:</strong> {wardName}
        </Text>
      )}

      <Text style={{ ...styles.p, marginTop: 16 }}>
        <strong>Message:</strong>
      </Text>
      <Text style={styles.message}>{details}</Text>
    </BaseEmail>
  );
}

const styles: Record<string, CSSProperties> = {
  h1: { fontSize: 22, margin: '0 0 12px 0' },
  p: { fontSize: 14, lineHeight: '22px', margin: '0 0 4px 0' },
  message: {
    fontSize: 14,
    lineHeight: '22px',
    margin: '4px 0 0 0',
    whiteSpace: 'pre-wrap',
  },
};
