// lib/email/resend.ts
import 'server-only';
import { Resend } from 'resend';
import type { ReactElement } from 'react';

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: ReactElement;
  from?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  suppressReplies?: boolean;
};

type SendPayload = Parameters<Resend['emails']['send']>[0];

type SendPayloadWithReact = Omit<SendPayload, 'react' | 'reply_to' | 'cc' | 'bcc'> & {
  react?: ReactElement;
  reply_to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
};

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY not set');
  }
  _resend = new Resend(key);
  return _resend;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  react,
  from,
  replyTo,
  cc,
  bcc,
  suppressReplies = true,
}: SendEmailArgs) {
  const fromAddr = from ?? process.env.EMAIL_FROM ?? 'Sloya Website <no-reply@example.com>';

  const payload: SendPayloadWithReact = {
    from: fromAddr,
    to,
    subject,
  };

  if (react) payload.react = react;
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (cc) payload.cc = cc;
  if (bcc) payload.bcc = bcc;

  if (!suppressReplies) {
    const rt = replyTo ?? process.env.EMAIL_REPLY_TO;
    if (rt) payload.reply_to = rt;
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send(payload as SendPayload);
  if (error) {
    throw new Error(error.message ?? 'Resend send failed');
  }
  return data;
}
