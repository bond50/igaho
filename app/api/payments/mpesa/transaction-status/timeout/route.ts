import { NextResponse } from 'next/server';

import { recordTransactionStatusTimeout } from '@/features/payments/lib/daraja-reconciliation';
import { assertTrustedDarajaRequest } from '@/features/payments/lib/guards';
import { openPaymentIncident } from '@/features/payments/lib/ledger';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    assertTrustedDarajaRequest(request);
  } catch (error) {
    await openPaymentIncident(db, {
      type: 'UNTRUSTED_CALLBACK',
      severity: 'CRITICAL',
      title: 'Rejected transaction-status timeout callback from untrusted source',
      detail: error instanceof Error ? error.message : 'Rejected transaction-status timeout callback from untrusted source.',
    });

    return NextResponse.json({ ok: false, message: 'Untrusted callback source.' }, { status: 403 });
  }

  const payload = await request.json();

  await recordTransactionStatusTimeout({
    originatorConversationId: payload?.OriginatorConversationID ?? null,
    conversationId: payload?.ConversationID ?? null,
    payload,
    resultDesc: payload?.ResultDesc ?? payload?.ResponseDescription ?? 'Daraja transaction status query timed out.',
  });

  return NextResponse.json({ ok: true });
}
