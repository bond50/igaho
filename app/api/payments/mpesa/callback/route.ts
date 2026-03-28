import { NextResponse } from 'next/server';

import { parseMpesaTransactionDate } from '@/features/payments/lib/daraja';
import { assertTrustedDarajaRequest } from '@/features/payments/lib/guards';
import { openPaymentIncident, resolvePaymentIncidents, updatePaymentIntentAudit, upsertPaymentLedgerRecord } from '@/features/payments/lib/ledger';
import { mapDarajaResultCodeToStatus } from '@/features/payments/lib/daraja-result';
import { db } from '@/lib/db';

function getCallbackItem(items: { Name: string; Value?: string | number | null }[] | undefined, name: string) {
  return items?.find((item) => item.Name === name)?.Value;
}

export async function POST(request: Request) {
  try {
    assertTrustedDarajaRequest(request);
  } catch (error) {
    await openPaymentIncident(db, {
      type: 'UNTRUSTED_CALLBACK',
      severity: 'CRITICAL',
      title: 'Rejected Daraja callback from untrusted source',
      detail: error instanceof Error ? error.message : 'Rejected callback from untrusted source.',
    });
    return NextResponse.json({ ok: false, message: 'Untrusted callback source.' }, { status: 403 });
  }

  const payload = await request.json();
  const callback = payload?.Body?.stkCallback;

  if (!callback?.CheckoutRequestID) {
    await openPaymentIncident(db, {
      type: 'INVALID_CALLBACK_PAYLOAD',
      severity: 'CRITICAL',
      title: 'Daraja callback payload missing CheckoutRequestID',
      detail: 'The callback payload could not be matched to an STK request.',
      metadata: payload,
    });
    return NextResponse.json({ ok: false, message: 'CheckoutRequestID missing.' }, { status: 400 });
  }

  const metadataItems = callback.CallbackMetadata?.Item as { Name: string; Value?: string | number | null }[] | undefined;
  const mpesaReceiptNumber = String(getCallbackItem(metadataItems, 'MpesaReceiptNumber') ?? '') || null;
  const amountValue = getCallbackItem(metadataItems, 'Amount');
  const transactionDateValue = getCallbackItem(metadataItems, 'TransactionDate');
  const phoneNumberValue = getCallbackItem(metadataItems, 'PhoneNumber');
  const transactionDate = parseMpesaTransactionDate(transactionDateValue);
  const resultCode = Number(callback.ResultCode);
  const resultDesc = callback.ResultDesc || null;
  const status = mapDarajaResultCodeToStatus(resultCode);
  const totalAmount = typeof amountValue === 'number' ? Math.round(amountValue) : Number(amountValue ?? 0) || null;
  const payerPhoneNumber = String(phoneNumberValue ?? '') || null;

  const stkRequest = await db.mpesaStkRequest.findFirst({
    where: { checkoutRequestId: callback.CheckoutRequestID },
    select: {
      id: true,
      userId: true,
      paymentIntentId: true,
      applicationId: true,
      transactionDesc: true,
      accountReference: true,
      phoneNumber: true,
      baseAmount: true,
      taxAmount: true,
      currency: true,
      merchantRequestId: true,
      requestPayload: true,
      statusQueryResponse: true,
      createdAt: true,
    },
  });

  if (!stkRequest) {
    await openPaymentIncident(db, {
      type: 'ORPHAN_CALLBACK',
      severity: 'CRITICAL',
      title: 'Daraja callback did not match any local STK request',
      detail: `CheckoutRequestID ${callback.CheckoutRequestID} was not found locally.`,
      metadata: payload,
    });
    return NextResponse.json({ ok: false, message: 'STK request not found.' }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    await tx.mpesaStkRequest.update({
      where: { id: stkRequest.id },
      data: {
        callbackPayload: payload,
        callbackReceivedAt: new Date(),
        resultCode,
        resultDesc,
        mpesaReceiptNumber,
        transactionDate,
        status,
        lastReconciledAt: new Date(),
        nextReconciliationAt: null,
        lastReconciliationSource: 'CALLBACK',
        lastReconciliationNote: status === 'SUCCESS' ? 'Daraja callback confirmed a successful payment.' : resultDesc ?? 'Daraja callback returned a payment outcome.',
      },
    });

    if (stkRequest.paymentIntentId) {
      await updatePaymentIntentAudit(tx, {
        intentId: stkRequest.paymentIntentId,
        providerReference: mpesaReceiptNumber ?? callback.CheckoutRequestID,
        checkoutRequestId: callback.CheckoutRequestID,
        payerPhoneNumber: payerPhoneNumber ?? stkRequest.phoneNumber,
        verificationStatus: status === 'SUCCESS' ? 'VERIFIED' : status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT' ? 'FAILED' : 'PENDING',
        verificationSource: 'CALLBACK',
        callbackPayload: payload,
        reconciliationPayload: stkRequest.statusQueryResponse as never,
        paymentInitiatedAt: stkRequest.createdAt,
        callbackReceivedAt: new Date(),
        lastVerifiedAt: status === 'SUCCESS' ? transactionDate ?? new Date() : null,
        verifiedAt: status === 'SUCCESS' ? transactionDate ?? new Date() : null,
        status: status === 'SUCCESS' ? 'VERIFIED' : status === 'FAILED' ? 'FAILED' : status === 'CANCELLED' ? 'CANCELLED' : status === 'TIMEOUT' ? 'EXPIRED' : 'AWAITING_PAYMENT',
        mpesaReceiptNumber,
        lastError: status === 'SUCCESS' ? null : resultDesc,
      });
    }

    if (stkRequest.applicationId && (mpesaReceiptNumber ?? callback.CheckoutRequestID)) {
      await upsertPaymentLedgerRecord(tx, {
        applicationId: stkRequest.applicationId,
        paymentIntentId: stkRequest.paymentIntentId,
        collectionMode: 'MPESA_DARAJA',
        paymentMethod: 'MPESA',
        transactionReferenceNumber: mpesaReceiptNumber ?? callback.CheckoutRequestID,
        providerReference: mpesaReceiptNumber ?? callback.CheckoutRequestID,
        externalReference: callback.CheckoutRequestID,
        checkoutRequestId: callback.CheckoutRequestID,
        merchantRequestId: stkRequest.merchantRequestId,
        payerPhoneNumber: payerPhoneNumber ?? stkRequest.phoneNumber,
        amount: totalAmount,
        baseAmount: stkRequest.baseAmount,
        taxAmount: stkRequest.taxAmount,
        totalAmount: totalAmount,
        currency: stkRequest.currency,
        verificationStatus: status === 'SUCCESS' ? 'VERIFIED' : status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT' ? 'FAILED' : 'PENDING',
        verificationSource: 'CALLBACK',
        rawRequestPayload: stkRequest.requestPayload as never,
        rawCallbackPayload: payload,
        reconciliationPayload: stkRequest.statusQueryResponse as never,
        description: stkRequest.transactionDesc,
        notes: `Daraja STK push payment for ${stkRequest.accountReference}`,
        status: status === 'SUCCESS' ? 'VERIFIED' : status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT' ? 'REJECTED' : 'PENDING',
        initiatedAt: stkRequest.createdAt,
        callbackReceivedAt: new Date(),
        verifiedAt: status === 'SUCCESS' ? transactionDate ?? new Date() : null,
        paidAt: transactionDate,
      });
    }

    if (status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT') {
      await openPaymentIncident(tx, {
        type: 'CALLBACK_FAILURE',
        severity: 'WARNING',
        title: 'Daraja callback reported an unsuccessful payment',
        detail: resultDesc,
        userId: stkRequest.userId,
        applicationId: stkRequest.applicationId,
        paymentIntentId: stkRequest.paymentIntentId,
        mpesaRequestId: stkRequest.id,
        metadata: payload,
      });
    } else {
      await resolvePaymentIncidents(tx, { mpesaRequestId: stkRequest.id }, 'Resolved after successful Daraja callback.');
    }
  });

  return NextResponse.json({ ok: true });
}
