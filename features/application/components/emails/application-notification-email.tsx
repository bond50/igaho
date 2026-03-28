import type { CSSProperties } from 'react';
import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';

import { BaseEmail } from '@/components/emails/base-email';

type ApplicationNotificationEmailProps = {
  preview: string;
  title: string;
  lead: string;
  details?: Array<{ label: string; value: string }>;
  note?: string;
};

export function ApplicationNotificationEmail({
  preview,
  title,
  lead,
  details = [],
  note,
}: ApplicationNotificationEmailProps) {
  return (
    <BaseEmail preview={preview}>
      <Heading style={styles.h1}>{title}</Heading>
      <Text style={styles.p}>{lead}</Text>
      {details.length > 0 ? (
        <Section style={styles.panel}>
          {details.map((detail) => (
            <Text key={`${detail.label}-${detail.value}`} style={styles.detailRow}>
              <strong>{detail.label}:</strong> {detail.value}
            </Text>
          ))}
        </Section>
      ) : null}
      {note ? <Text style={{ ...styles.p, color: '#555' }}>{note}</Text> : null}
    </BaseEmail>
  );
}

const styles: Record<string, CSSProperties> = {
  h1: { fontSize: 24, margin: 0 },
  p: { fontSize: 14, lineHeight: '22px' },
  panel: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '16px 18px',
    margin: '20px 0',
  },
  detailRow: {
    fontSize: 14,
    lineHeight: '22px',
    margin: '0 0 8px',
  },
};
