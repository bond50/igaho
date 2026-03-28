import { NextResponse } from 'next/server';

import { recordTransactionStatusTimeout } from '@/features/payments/lib/daraja-reconciliation';

export async function POST(request: Request) {
  const payload = await request.json();

  await recordTransactionStatusTimeout({
    originatorConversationId: payload?.OriginatorConversationID ?? null,
    conversationId: payload?.ConversationID ?? null,
    payload,
    resultDesc: payload?.ResultDesc ?? payload?.ResponseDescription ?? 'Daraja transaction status query timed out.',
  });

  return NextResponse.json({ ok: true });
}
