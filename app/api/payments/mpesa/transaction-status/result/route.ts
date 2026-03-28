import { NextResponse } from 'next/server';

import { finalizeTransactionStatusResult } from '@/features/payments/lib/daraja-reconciliation';
import { parseMpesaTransactionDate } from '@/features/payments/lib/daraja';

function findResultParameter(parameters: unknown, key: string) {
  if (!Array.isArray(parameters)) return undefined;
  const match = parameters.find((item) => item && typeof item === 'object' && 'Key' in item && (item as { Key?: unknown }).Key === key) as { Value?: unknown } | undefined;
  return match?.Value;
}

export async function POST(request: Request) {
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
    resultCode: typeof result?.ResultCode === 'number' ? result.ResultCode : Number(result?.ResultCode ?? 0),
    resultDesc: result?.ResultDesc ?? null,
    transactionId: (findResultParameter(result?.ResultParameters?.ResultParameter, 'TransactionID') as string | null | undefined) ?? null,
    receiptNumber: receiptNumber ? String(receiptNumber) : null,
    transactionDate,
  });

  return NextResponse.json({ ok: true });
}
