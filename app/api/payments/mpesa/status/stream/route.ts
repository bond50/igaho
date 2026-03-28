import { auth } from '@/auth';
import { reconcileMpesaStkRequest, shouldQueryMpesaRequest } from '@/features/payments/lib/daraja-reconciliation';
import { getApplicantActivePaymentIntent, getLatestApplicantMpesaRequest, getRecentMpesaStkRequests } from '@/features/payments/queries/daraja';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();
const PAYMENT_STREAM_INTERVAL_MS = 3000;

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

function serializeEvent(data: unknown) {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function serializeComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

async function getAdminStatusSnapshot(limit: number) {
  let recentRequests = await getRecentMpesaStkRequests(limit);
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
    recentRequests = await getRecentMpesaStkRequests(limit);
  }

  return {
    recentRequests: recentRequests.map((item) => serializeAdminRequest(item)),
  };
}

async function getApplicantStatusSnapshot(userId: string) {
  let latestRequest = await getLatestApplicantMpesaRequest(userId);
  let paymentIntent = await getApplicantActivePaymentIntent(userId);

  if (latestRequest?.checkoutRequestId && shouldQueryMpesaRequest({
    status: latestRequest.status,
    updatedAt: latestRequest.updatedAt,
    nextReconciliationAt: latestRequest.nextReconciliationAt,
    lastStatusQueryAt: latestRequest.lastStatusQueryAt,
  })) {
    await reconcileMpesaStkRequest(latestRequest.id, { source: 'AUTO_POLL' });
    latestRequest = await getLatestApplicantMpesaRequest(userId);
    paymentIntent = await getApplicantActivePaymentIntent(userId);
  }

  return {
    latestRequest: serializeApplicantRequest(latestRequest),
    paymentIntent: serializeApplicantPaymentIntent(paymentIntent),
  };
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') ?? 'admin';

  if (scope === 'admin' && session.user.role !== 'ADMIN') {
    return new Response('Forbidden', { status: 403 });
  }

  const limit = Number(searchParams.get('limit') ?? 10);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 25) : 10;

  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cancelled = false;
      let inFlight = false;

      const pushSnapshot = async () => {
        if (cancelled || inFlight) return;
        inFlight = true;

        try {
          const snapshot = scope === 'admin'
            ? await getAdminStatusSnapshot(safeLimit)
            : await getApplicantStatusSnapshot(session.user.id);
          controller.enqueue(serializeEvent(snapshot));
        } catch {
          controller.enqueue(serializeComment(scope === 'admin' ? 'admin-payment-status-refresh-failed' : 'applicant-payment-status-refresh-failed'));
        } finally {
          inFlight = false;
        }
      };

      await pushSnapshot();
      interval = setInterval(() => {
        void pushSnapshot();
      }, PAYMENT_STREAM_INTERVAL_MS);

      return () => {
        cancelled = true;
      };
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
