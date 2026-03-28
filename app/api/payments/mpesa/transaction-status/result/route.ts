import { NextResponse } from 'next/server';

import { finalizeTransactionStatusResult } from '@/features/payments/lib/daraja-reconciliation';
import { parseMpesaTransactionDate } from '@/features/payments/lib/daraja';
import { assertTrustedDarajaRequest } from '@/features/payments/lib/guards';
import { openPaymentIncident } from '@/features/payments/lib/ledger';
import { db } from '@/lib/db';

function findResultParameter(parameters: unknown, key: string) {
  if (!Array.isArray(parameters)) return undefined;
  const match = parameters.find((item) => item && typeof item === 'object' && 'Key' in item && (item as { Key?: unknown }).Key === key) as { Value?: unknown } | undefined;
  return match?.Value;
}

function parseResultCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    assertTrustedDarajaRequest(request);
  } catch (error) {
    await openPaymentIncident(db, {
      type: 'UNTRUSTED_CALLBACK',
      severity: 'CRITICAL',
      title: 'Rejected transaction-status callback from untrusted source',
      detail: error instanceof Error ? error.message : 'Rejected transaction-status callback from untrusted source.',
    });

    return NextResponse.json({ ok: false, message: 'Untrusted callback source.' }, { status: 403 });
  }

  const payload = await request.json();
  const result = payload?.Result ?? payload;

  const transactionDateValue = findResultParameter(result?.ResultParameters?.ResultParameter, 'TransactionCompletedDateTime')
    ?? findResultParameter(result?.ResultParameters?.ResultParameter, 'TransactionDate');
  const receiptNumber = findResultParameter(result?.ResultParameters?.ResultParameter, 'ReceiptNo')
    ?? findResultParameter(result?.ResultParameters?.ResultParameter, 'MpesaReceiptNumber');
  const transactionDate = parseMpesaTransactionDate(transactionDateValue as string | number | null | undefined);

  await finalizeTransactionStatusResult({
    originatorConversationId: result?.OriginatorConversationID ?? null,
    conversationId: result?.ConversationID ?? null,
    payload,
    resultCode: parseResultCode(result?.ResultCode),
    resultDesc: result?.ResultDesc ?? null,
    transactionId: (findResultParameter(result?.ResultParameters?.ResultParameter, 'TransactionID') as string | null | undefined) ?? null,
    receiptNumber: receiptNumber ? String(receiptNumber) : null,
    transactionDate,
  });

  return NextResponse.json({ ok: true });
}
