import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getApplicantActivePaymentIntent, getLatestApplicantMpesaRequest, getRecentMpesaStkRequests } from '@/features/payments/queries/daraja';
import { reconcileMpesaStkRequest, shouldQueryMpesaRequest } from '@/features/payments/lib/daraja-reconciliation';

function serializeApplicantRequest(request: Awaited<ReturnType<typeof getLatestApplicantMpesaRequest>>) {
  if (!request) return null;

  return {
    id: request.id,
    payerPhoneNumber: request.phoneNumber,
    amount: request.amount,
    accountReference: request.accountReference,
    transactionDesc: request.transactionDesc,
    merchantRequestId: request.merchantRequestId,
    checkoutRequestId: request.checkoutRequestId,
    customerMessage: request.customerMessage,
    status: request.status,
    resultCode: request.resultCode,
    resultDesc: request.resultDesc,
    receiptNumber: request.mpesaReceiptNumber,
    callbackUrl: request.callbackUrl,
    reconciliationAttemptCount: request.reconciliationAttemptCount,
    lastReconciledAt: request.lastReconciledAt?.toISOString() ?? null,
    lastReconciliationSource: request.lastReconciliationSource,
    lastReconciliationNote: request.lastReconciliationNote,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function serializeApplicantPaymentIntent(intent: Awaited<ReturnType<typeof getApplicantActivePaymentIntent>>) {
  if (!intent) return null;

  return {
    id: intent.id,
    status: intent.status,
    payerPhoneNumber: intent.payerPhoneNumber,
    baseAmount: intent.baseAmount,
    taxAmount: intent.taxAmount,
    totalAmount: intent.totalAmount,
    currency: intent.currency,
    accountReference: intent.accountReference,
    receiptNumber: intent.mpesaReceiptNumber,
    checkoutRequestId: intent.checkoutRequestId,
    lastError: intent.lastError,
    verifiedAt: intent.verifiedAt?.toISOString() ?? null,
    lockedAt: intent.lockedAt?.toISOString() ?? null,
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

function serializeAdminRequest(request: Awaited<ReturnType<typeof getRecentMpesaStkRequests>>[number]) {
  return {
    id: request.id,
    phoneNumber: request.phoneNumber,
    amount: request.amount,
    accountReference: request.accountReference,
    transactionDesc: request.transactionDesc,
    merchantRequestId: request.merchantRequestId,
    checkoutRequestId: request.checkoutRequestId,
    customerMessage: request.customerMessage,
    status: request.status,
    resultCode: request.resultCode,
    resultDesc: request.resultDesc,
    mpesaReceiptNumber: request.mpesaReceiptNumber,
    callbackUrl: request.callbackUrl,
    reconciliationAttemptCount: request.reconciliationAttemptCount,
    lastReconciledAt: request.lastReconciledAt?.toISOString() ?? null,
    lastReconciliationSource: request.lastReconciliationSource,
    lastReconciliationNote: request.lastReconciliationNote,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    application: request.application
      ? {
          id: request.application.id,
          firstName: request.application.firstName,
          surname: request.application.surname,
          email: request.application.email,
          membershipNumber: request.application.membershipNumber,
        }
      : null,
    paymentIntent: request.paymentIntent
      ? {
          id: request.paymentIntent.id,
          purpose: request.paymentIntent.purpose,
          billingYear: request.paymentIntent.billingYear,
        }
      : null,
  };
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') ?? 'applicant';

  if (scope === 'admin') {
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = Number(searchParams.get('limit') ?? 10);
    let recentRequests = await getRecentMpesaStkRequests(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 25) : 10);
    const eligibleIds = recentRequests
      .filter((item) => item.checkoutRequestId && shouldQueryMpesaRequest({
        status: item.status,
        updatedAt: item.updatedAt,
        nextReconciliationAt: item.nextReconciliationAt,
        lastStatusQueryAt: item.lastStatusQueryAt,
      }))
      .map((item) => item.id);

    if (eligibleIds.length > 0) {
      await Promise.allSettled(eligibleIds.map((id) => reconcileMpesaStkRequest(id, { source: 'AUTO_POLL' })));
      recentRequests = await getRecentMpesaStkRequests(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 25) : 10);
    }

    return NextResponse.json({
      recentRequests: recentRequests.map((item) => serializeAdminRequest(item)),
    });
  }

  let latestRequest = await getLatestApplicantMpesaRequest(session.user.id);
  let paymentIntent = await getApplicantActivePaymentIntent(session.user.id);
  if (latestRequest && latestRequest.checkoutRequestId && shouldQueryMpesaRequest({
    status: latestRequest.status,
    updatedAt: latestRequest.updatedAt,
    nextReconciliationAt: latestRequest.nextReconciliationAt,
    lastStatusQueryAt: latestRequest.lastStatusQueryAt,
  })) {
    await reconcileMpesaStkRequest(latestRequest.id, { source: 'AUTO_POLL' });
    latestRequest = await getLatestApplicantMpesaRequest(session.user.id);
    paymentIntent = await getApplicantActivePaymentIntent(session.user.id);
  }

  return NextResponse.json({
    latestRequest: serializeApplicantRequest(latestRequest),
    paymentIntent: serializeApplicantPaymentIntent(paymentIntent),
  });
}


