// components/emails/BaseEmail.tsx
import * as React from 'react';
import type { CSSProperties } from 'react';
import { Html, Head, Preview, Body, Container, Hr, Text } from '@react-email/components';

export function BaseEmail({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          {children}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>© {new Date().getFullYear()} Sloya Website</Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles: Record<string, CSSProperties> = {
  body: {
    backgroundColor: '#f6f9fc',
    margin: 0,
    padding: '24px 0',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    margin: '0 auto',
    maxWidth: 560,
  },
  hr: { border: 'none', borderTop: '1px solid #eee', margin: '24px 0' },
  footer: { fontSize: 12, color: '#777' },
};
