import { Prisma } from '@/prisma/src/generated/prisma/client';

import { db } from '@/lib/db';
import { openPaymentIncident, resolvePaymentIncidents, updatePaymentIntentAudit, upsertPaymentLedgerRecord } from '@/features/payments/lib/ledger';
import { mapDarajaResultCodeToStatus, type MpesaRequestStatus } from '@/features/payments/lib/daraja-result';
import { queryDarajaStkPushStatus, queryDarajaTransactionStatus } from '@/features/payments/lib/daraja';
import { getStaleMpesaRequests } from '@/features/payments/queries/daraja';

const LIVE_STATUSES = new Set<MpesaRequestStatus>(['INITIATED', 'AWAITING_CALLBACK', 'CALLBACK_RECEIVED']);
const STALE_TIMEOUT_MS = 10 * 60_000;
const RETRY_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

type ReconciliationSource = 'CALLBACK' | 'AUTO_POLL' | 'MANUAL_VERIFY' | 'STK_QUERY' | 'TRANSACTION_STATUS_QUERY' | 'TRANSACTION_STATUS_CALLBACK' | 'TIMEOUT_HANDLER' | 'RECONCILIATION_JOB';

function isLiveStatus(status: string): status is MpesaRequestStatus {
  return LIVE_STATUSES.has(status as MpesaRequestStatus);
}

function getRetryDelay(attemptCount: number) {
  return RETRY_BACKOFF_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_BACKOFF_MS.length - 1)];
}

function buildReconciliationNote(status: MpesaRequestStatus, source: ReconciliationSource, resultDesc: string | null) {
  if (status === 'VERIFIED') return `Payment verified through ${source.toLowerCase().replaceAll('_', ' ')}.`;
  if (status === 'SUCCESS') return `Payment confirmed through ${source.toLowerCase().replaceAll('_', ' ')}.`;
  if (status === 'TIMEOUT') return resultDesc ?? 'Payment timed out after repeated reconciliation attempts.';
  if (status === 'FAILED' || status === 'CANCELLED') return resultDesc ?? `Payment marked ${status.toLowerCase()} during ${source.toLowerCase().replaceAll('_', ' ')}.`;
  return resultDesc ?? `Awaiting callback or further Daraja verification. Last checked via ${source.toLowerCase().replaceAll('_', ' ')}.`;
}

function getNextReconciliationAt(status: MpesaRequestStatus, attemptCount: number) {
  if (!isLiveStatus(status)) return null;
  return new Date(Date.now() + getRetryDelay(attemptCount));
}

function mapRequestStatusToIntentStatus(status: MpesaRequestStatus) {
  if (status === 'SUCCESS' || status === 'VERIFIED') return 'VERIFIED' as const;
  if (status === 'FAILED') return 'FAILED' as const;
  if (status === 'CANCELLED') return 'CANCELLED' as const;
  if (status === 'TIMEOUT') return 'EXPIRED' as const;
  return 'AWAITING_PAYMENT' as const;
}

function mapVerificationStatus(status: MpesaRequestStatus) {
  if (status === 'SUCCESS' || status === 'VERIFIED') return 'VERIFIED' as const;
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT') return 'FAILED' as const;
  return 'PENDING' as const;
}

function mapVerificationSource(source: ReconciliationSource) {
  if (source === 'CALLBACK') return 'CALLBACK' as const;
  if (source === 'STK_QUERY') return 'STK_QUERY' as const;
  if (source === 'TRANSACTION_STATUS_QUERY') return 'TRANSACTION_STATUS_QUERY' as const;
  if (source === 'TRANSACTION_STATUS_CALLBACK') return 'TRANSACTION_STATUS_CALLBACK' as const;
  if (source === 'RECONCILIATION_JOB') return 'RECONCILIATION_JOB' as const;
  return 'MANUAL_ADMIN' as const;
}

export function shouldQueryMpesaRequest(input: {
  status: string;
  updatedAt: Date;
  nextReconciliationAt: Date | null;
  lastStatusQueryAt: Date | null;
}) {
  if (!isLiveStatus(input.status)) return false;

  if (input.nextReconciliationAt) {
    return Date.now() >= input.nextReconciliationAt.getTime();
  }

  const fallback = input.lastStatusQueryAt ?? input.updatedAt;
  return Date.now() - fallback.getTime() >= RETRY_BACKOFF_MS[0];
}

async function syncLedgerAndIncidents(
  tx: Prisma.TransactionClient,
  request: {
    id: string;
    userId: string | null;
    paymentIntentId: string | null;
    applicationId: string | null;
    merchantRequestId: string | null;
    checkoutRequestId: string | null;
    mpesaReceiptNumber: string | null;
    phoneNumber: string;
    amount: number;
    baseAmount: number | null;
    taxAmount: number | null;
    currency: string;
    transactionDesc: string;
    transactionDate: Date | null;
    requestPayload: Prisma.JsonValue | null;
    callbackPayload: Prisma.JsonValue | null;
    statusQueryResponse: Prisma.JsonValue | null;
    status: MpesaRequestStatus;
    resultDesc: string | null;
    createdAt: Date;
    callbackReceivedAt: Date | null;
    updatedAt: Date;
  },
  source: ReconciliationSource,
) {
  const paymentIntentMeta = request.paymentIntentId
    ? await tx.paymentIntent.findUnique({
        where: { id: request.paymentIntentId },
        select: {
          purpose: true,
          billingYear: true,
        },
      })
    : null;

  const isRenewalPayment = paymentIntentMeta?.purpose === 'ANNUAL_RENEWAL';
  const successful = request.status === 'SUCCESS' || request.status === 'VERIFIED';
  const portalSetting = isRenewalPayment
    ? await tx.applicationPortalSetting.findUnique({
        where: { singletonKey: 'default' },
        select: { renewalMode: true },
      })
    : null;
  const renewalMode = portalSetting?.renewalMode ?? 'MANUAL_REVIEW';
  const renewalAwaitingReview = Boolean(isRenewalPayment && successful && renewalMode === 'MANUAL_REVIEW');
  const renewalAutoRestore = Boolean(isRenewalPayment && successful && renewalMode === 'PAY_AND_ACTIVATE');

  if (request.paymentIntentId) {
    await updatePaymentIntentAudit(tx, {
      intentId: request.paymentIntentId,
      providerReference: request.mpesaReceiptNumber ?? request.checkoutRequestId,
      checkoutRequestId: request.checkoutRequestId,
      payerPhoneNumber: request.phoneNumber,
      verificationStatus: renewalAwaitingReview ? 'MANUAL_REVIEW' : mapVerificationStatus(request.status),
      verificationSource: mapVerificationSource(source),
      callbackPayload: request.callbackPayload as Prisma.InputJsonValue | null,
      reconciliationPayload: request.statusQueryResponse as Prisma.InputJsonValue | null,
      paymentInitiatedAt: request.createdAt,
      callbackReceivedAt: request.callbackReceivedAt,
      lastVerifiedAt: successful ? request.transactionDate ?? new Date() : null,
      verifiedAt: successful ? request.transactionDate ?? new Date() : null,
      lockedAt: renewalAutoRestore ? request.transactionDate ?? new Date() : null,
      status: renewalAutoRestore ? 'LOCKED' : mapRequestStatusToIntentStatus(request.status),
      mpesaReceiptNumber: request.mpesaReceiptNumber,
      lastError: request.status === 'FAILED' || request.status === 'CANCELLED' || request.status === 'TIMEOUT' ? request.resultDesc : null,
    });
  }

  if (request.applicationId && (request.mpesaReceiptNumber ?? request.checkoutRequestId)) {
    await upsertPaymentLedgerRecord(tx, {
      applicationId: request.applicationId,
      purpose: paymentIntentMeta?.purpose ?? 'APPLICATION_FEE',
      billingYear: paymentIntentMeta?.billingYear ?? null,
      paymentIntentId: request.paymentIntentId,
      collectionMode: 'MPESA_DARAJA',
      paymentMethod: 'MPESA',
      transactionReferenceNumber: request.mpesaReceiptNumber ?? request.checkoutRequestId!,
      providerReference: request.mpesaReceiptNumber ?? request.checkoutRequestId,
      externalReference: request.checkoutRequestId,
      checkoutRequestId: request.checkoutRequestId,
      merchantRequestId: request.merchantRequestId,
      payerPhoneNumber: request.phoneNumber,
      amount: request.amount,
      baseAmount: request.baseAmount,
      taxAmount: request.taxAmount,
      totalAmount: request.amount,
      currency: request.currency,
      verificationStatus: renewalAwaitingReview ? 'MANUAL_REVIEW' : mapVerificationStatus(request.status),
      verificationSource: mapVerificationSource(source),
      rawRequestPayload: request.requestPayload as Prisma.InputJsonValue | null,
      rawCallbackPayload: request.callbackPayload as Prisma.InputJsonValue | null,
      reconciliationPayload: request.statusQueryResponse as Prisma.InputJsonValue | null,
      description: request.transactionDesc,
      notes: renewalAwaitingReview
        ? 'Payment received and waiting for admin renewal approval.'
        : buildReconciliationNote(request.status, source, request.resultDesc),
      status: renewalAwaitingReview
        ? 'PENDING'
        : request.status === 'SUCCESS' || request.status === 'VERIFIED'
          ? 'VERIFIED'
          : request.status === 'FAILED' || request.status === 'CANCELLED' || request.status === 'TIMEOUT'
            ? 'REJECTED'
            : 'PENDING',
      initiatedAt: request.createdAt,
      callbackReceivedAt: request.callbackReceivedAt,
      verifiedAt: successful ? request.transactionDate ?? new Date() : null,
      paidAt: request.transactionDate ?? request.updatedAt,
    });
  }

  if (renewalAwaitingReview) {
    await openPaymentIncident(tx, {
      type: 'RENEWAL_REVIEW_REQUIRED',
      severity: 'WARNING',
      title: 'Renewal payment is waiting for admin approval',
      detail: 'The renewal payment was received successfully and now needs admin approval before access is restored.',
      userId: request.userId,
      applicationId: request.applicationId,
      paymentIntentId: request.paymentIntentId,
      mpesaRequestId: request.id,
      metadata: {
        source,
        checkoutRequestId: request.checkoutRequestId,
        receiptNumber: request.mpesaReceiptNumber,
      },
    });
  }

  if (request.status === 'FAILED' || request.status === 'CANCELLED' || request.status === 'TIMEOUT') {
    await openPaymentIncident(tx, {
      type: request.status === 'TIMEOUT' ? 'CALLBACK_TIMEOUT' : 'PAYMENT_FAILURE',
      severity: request.status === 'TIMEOUT' ? 'CRITICAL' : 'WARNING',
      title: request.status === 'TIMEOUT' ? 'Payment callback timed out' : 'Payment needs follow-up',
      detail: request.resultDesc ?? buildReconciliationNote(request.status, source, null),
      userId: request.userId,
      applicationId: request.applicationId,
      paymentIntentId: request.paymentIntentId,
      mpesaRequestId: request.id,
      metadata: {
        source,
        status: request.status,
        checkoutRequestId: request.checkoutRequestId,
        receiptNumber: request.mpesaReceiptNumber,
      },
    });
    return;
  }

  if ((request.status === 'SUCCESS' || request.status === 'VERIFIED') && !request.callbackPayload) {
    await openPaymentIncident(tx, {
      type: 'CALLBACK_MISSING_POSSIBLY_PAID',
      severity: 'INFO',
      title: 'Callback missing but payment appears successful',
      detail: 'Daraja status verification indicates success, but the original callback payload is missing.',
      userId: request.userId,
      applicationId: request.applicationId,
      paymentIntentId: request.paymentIntentId,
      mpesaRequestId: request.id,
      metadata: {
        source,
        checkoutRequestId: request.checkoutRequestId,
        receiptNumber: request.mpesaReceiptNumber,
      },
    });
  }

  if (!renewalAwaitingReview) {
    await resolvePaymentIncidents(
      tx,
      {
        mpesaRequestId: request.id,
      },
      `Resolved after payment reached ${request.status.toLowerCase()} via ${source.toLowerCase().replaceAll('_', ' ')}.`,
    );
  }
}

async function updateRequestState(
  tx: Prisma.TransactionClient,
  requestId: string,
  input: {
    status: MpesaRequestStatus;
    source: ReconciliationSource;
    resultCode?: number | null;
    resultDesc?: string | null;
    payloadField?: 'statusQueryPayload' | 'transactionStatusPayload' | 'transactionStatusCallbackPayload' | 'transactionStatusTimeoutPayload' | 'callbackPayload';
    payload?: Prisma.InputJsonValue | null;
    responseField?: 'statusQueryResponse' | 'transactionStatusResponse';
    response?: Prisma.InputJsonValue | null;
    extraData?: Prisma.MpesaStkRequestUpdateInput;
    transactionStatusOriginatorConversationId?: string | null;
    transactionStatusConversationId?: string | null;
  },
) {
  const current = await tx.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      userId: true,
      paymentIntentId: true,
      reconciliationAttemptCount: true,
      applicationId: true,
      merchantRequestId: true,
      mpesaReceiptNumber: true,
      checkoutRequestId: true,
      phoneNumber: true,
      amount: true,
      baseAmount: true,
      taxAmount: true,
      currency: true,
      transactionDesc: true,
      transactionDate: true,
      requestPayload: true,
      callbackPayload: true,
      callbackReceivedAt: true,
      statusQueryResponse: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!current) {
    throw new Error('Payment request not found.');
  }

  const nextAttemptCount = input.source === 'AUTO_POLL' || input.source === 'MANUAL_VERIFY' || input.source === 'STK_QUERY' || input.source === 'RECONCILIATION_JOB'
    ? current.reconciliationAttemptCount + 1
    : current.reconciliationAttemptCount;

  const now = new Date();
  const note = buildReconciliationNote(input.status, input.source, input.resultDesc ?? null);

  const updateData: Prisma.MpesaStkRequestUpdateInput = {
    status: input.status,
    resultCode: input.resultCode,
    resultDesc: input.resultDesc,
    reconciliationAttemptCount: nextAttemptCount,
    lastReconciledAt: now,
    nextReconciliationAt: getNextReconciliationAt(input.status, nextAttemptCount),
    lastReconciliationSource: input.source,
    lastReconciliationNote: note,
    ...input.extraData,
  };

  if (input.payloadField && input.payload) {
    updateData[input.payloadField] = input.payload;
  }

  if (input.responseField && input.response) {
    updateData[input.responseField] = input.response;
  }

  if (input.source === 'STK_QUERY' || input.source === 'RECONCILIATION_JOB') {
    updateData.lastStatusQueryAt = now;
  }

  if (input.source === 'TRANSACTION_STATUS_QUERY') {
    updateData.lastTransactionStatusQueryAt = now;
    updateData.transactionStatusOriginatorConversationId = input.transactionStatusOriginatorConversationId ?? null;
    updateData.transactionStatusConversationId = input.transactionStatusConversationId ?? null;
  }

  const updatedRequest = await tx.mpesaStkRequest.update({
    where: { id: requestId },
    data: updateData,
  });

  await syncLedgerAndIncidents(tx, {
    id: updatedRequest.id,
    userId: updatedRequest.userId,
    paymentIntentId: updatedRequest.paymentIntentId,
    applicationId: updatedRequest.applicationId,
    merchantRequestId: updatedRequest.merchantRequestId,
    checkoutRequestId: updatedRequest.checkoutRequestId,
    mpesaReceiptNumber: updatedRequest.mpesaReceiptNumber,
    phoneNumber: updatedRequest.phoneNumber,
    amount: updatedRequest.amount,
    baseAmount: updatedRequest.baseAmount,
    taxAmount: updatedRequest.taxAmount,
    currency: updatedRequest.currency,
    transactionDesc: updatedRequest.transactionDesc,
    transactionDate: updatedRequest.transactionDate,
    requestPayload: updatedRequest.requestPayload,
    callbackPayload: updatedRequest.callbackPayload,
    statusQueryResponse: updatedRequest.statusQueryResponse,
    status: updatedRequest.status,
    resultDesc: updatedRequest.resultDesc,
    createdAt: updatedRequest.createdAt,
    callbackReceivedAt: updatedRequest.callbackReceivedAt,
    updatedAt: updatedRequest.updatedAt,
  }, input.source);

  return updatedRequest;
}

export async function reconcileMpesaStkRequest(requestId: string, options?: { source?: Extract<ReconciliationSource, 'AUTO_POLL' | 'MANUAL_VERIFY' | 'RECONCILIATION_JOB'>; force?: boolean }) {
  const source = options?.source ?? 'AUTO_POLL';
  const request = await db.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      applicationId: true,
      paymentIntentId: true,
      phoneNumber: true,
      amount: true,
      baseAmount: true,
      taxAmount: true,
      currency: true,
      accountReference: true,
      transactionDesc: true,
      checkoutRequestId: true,
      mpesaReceiptNumber: true,
      transactionDate: true,
      resultCode: true,
      resultDesc: true,
      status: true,
      lastStatusQueryAt: true,
      updatedAt: true,
      requestPayload: true,
      reconciliationAttemptCount: true,
      nextReconciliationAt: true,
      createdAt: true,
    },
  });

  if (!request?.checkoutRequestId) {
    throw new Error('This STK request does not have a CheckoutRequestID yet.');
  }

  if (!options?.force && !shouldQueryMpesaRequest({
    status: request.status,
    updatedAt: request.updatedAt,
    nextReconciliationAt: request.nextReconciliationAt,
    lastStatusQueryAt: request.lastStatusQueryAt,
  })) {
    return request;
  }

  if (isLiveStatus(request.status) && Date.now() - request.createdAt.getTime() >= STALE_TIMEOUT_MS && request.reconciliationAttemptCount >= RETRY_BACKOFF_MS.length) {
    return db.$transaction((tx) => updateRequestState(tx, request.id, {
      status: 'TIMEOUT',
      source,
      resultCode: request.resultCode,
      resultDesc: 'No callback or successful verification was received before the reconciliation timeout window elapsed.',
    }));
  }

  const shortCode =
    typeof request.requestPayload === 'object' && request.requestPayload && 'BusinessShortCode' in request.requestPayload
      ? String((request.requestPayload as Record<string, unknown>).BusinessShortCode ?? '')
      : null;

  const query = await queryDarajaStkPushStatus({
    checkoutRequestId: request.checkoutRequestId,
    shortCode: shortCode || undefined,
  });

  const rawResultCode = query.response.ResultCode;
  const resultCode = rawResultCode === undefined || rawResultCode === null || rawResultCode === '' ? null : Number(rawResultCode);
  const resultDesc = query.response.ResultDesc ?? query.response.ResponseDescription ?? request.resultDesc ?? null;
  const resolvedStatus = mapDarajaResultCodeToStatus(resultCode);

  return db.$transaction((tx) => updateRequestState(tx, request.id, {
    status: resolvedStatus,
    source: source === 'RECONCILIATION_JOB' ? 'RECONCILIATION_JOB' : 'STK_QUERY',
    resultCode,
    resultDesc,
    payloadField: 'statusQueryPayload',
    payload: query.payload as Prisma.InputJsonValue,
    responseField: 'statusQueryResponse',
    response: query.response as Prisma.InputJsonValue,
  }));
}

export async function triggerTransactionStatusVerification(requestId: string) {
  const request = await db.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      mpesaReceiptNumber: true,
      checkoutRequestId: true,
      requestPayload: true,
    },
  });

  if (!request) {
    throw new Error('Payment request not found.');
  }

  const transactionId = request.mpesaReceiptNumber ?? request.checkoutRequestId;
  if (!transactionId) {
    throw new Error('No transaction reference is available yet for transaction-status verification.');
  }

  const shortCode =
    typeof request.requestPayload === 'object' && request.requestPayload && 'BusinessShortCode' in request.requestPayload
      ? String((request.requestPayload as Record<string, unknown>).BusinessShortCode ?? '')
      : null;

  const query = await queryDarajaTransactionStatus({
    transactionId,
    shortCode: shortCode || undefined,
    remarks: `Verify ${transactionId}`,
    occasion: 'IGANO payment verification',
  });

  return db.$transaction((tx) => updateRequestState(tx, request.id, {
    status: 'CALLBACK_RECEIVED',
    source: 'TRANSACTION_STATUS_QUERY',
    resultDesc: 'Daraja transaction-status query submitted. Waiting for result callback.',
    payloadField: 'transactionStatusPayload',
    payload: query.payload as Prisma.InputJsonValue,
    responseField: 'transactionStatusResponse',
    response: query.response as Prisma.InputJsonValue,
    transactionStatusOriginatorConversationId: query.response.OriginatorConversationID ?? null,
    transactionStatusConversationId: query.response.ConversationID ?? null,
  }));
}

export async function manuallyVerifyMpesaRequest(requestId: string) {
  const request = await db.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      resultCode: true,
      resultDesc: true,
      mpesaReceiptNumber: true,
      transactionDate: true,
    },
  });

  if (!request) {
    throw new Error('Payment request not found.');
  }

  if (!request.mpesaReceiptNumber && request.status !== 'SUCCESS') {
    throw new Error('This payment cannot be manually verified yet because there is no successful receipt or success state recorded.');
  }

  return db.$transaction((tx) => updateRequestState(tx, request.id, {
    status: 'VERIFIED',
    source: 'MANUAL_VERIFY',
    resultCode: request.resultCode,
    resultDesc: request.resultDesc ?? 'Payment manually verified by an administrator.',
    extraData: {
      transactionDate: request.transactionDate ?? new Date(),
    },
  }));
}

export async function finalizeTransactionStatusResult(input: {
  originatorConversationId?: string | null;
  conversationId?: string | null;
  payload: unknown;
  resultCode: number | null;
  resultDesc: string | null;
  transactionId?: string | null;
  receiptNumber?: string | null;
  transactionDate?: Date | null;
}) {
  const request = await db.mpesaStkRequest.findFirst({
    where: {
      OR: [
        input.originatorConversationId ? { transactionStatusOriginatorConversationId: input.originatorConversationId } : undefined,
        input.conversationId ? { transactionStatusConversationId: input.conversationId } : undefined,
      ].filter(Boolean) as Prisma.MpesaStkRequestWhereInput[],
    },
  });

  if (!request) {
    return null;
  }

  const receiptNumber = input.receiptNumber ?? request.mpesaReceiptNumber;
  const transactionDate = input.transactionDate ?? request.transactionDate;
  const mapped = mapDarajaResultCodeToStatus(input.resultCode);
  const status: MpesaRequestStatus = mapped === 'SUCCESS' ? 'VERIFIED' : mapped;

  return db.$transaction((tx) => updateRequestState(tx, request.id, {
    status,
    source: 'TRANSACTION_STATUS_CALLBACK',
    resultCode: input.resultCode,
    resultDesc: input.resultDesc,
    payloadField: 'transactionStatusCallbackPayload',
    payload: input.payload as Prisma.InputJsonValue,
    extraData: {
      mpesaReceiptNumber: receiptNumber,
      transactionDate,
    },
  }));
}

export async function recordTransactionStatusTimeout(input: {
  originatorConversationId?: string | null;
  conversationId?: string | null;
  payload: unknown;
  resultDesc?: string | null;
}) {
  const request = await db.mpesaStkRequest.findFirst({
    where: {
      OR: [
        input.originatorConversationId ? { transactionStatusOriginatorConversationId: input.originatorConversationId } : undefined,
        input.conversationId ? { transactionStatusConversationId: input.conversationId } : undefined,
      ].filter(Boolean) as Prisma.MpesaStkRequestWhereInput[],
    },
  });

  if (!request) {
    return null;
  }

  return db.$transaction((tx) => updateRequestState(tx, request.id, {
    status: 'TIMEOUT',
    source: 'TIMEOUT_HANDLER',
    resultCode: request.resultCode,
    resultDesc: input.resultDesc ?? request.resultDesc ?? 'Daraja transaction status query timed out.',
    payloadField: 'transactionStatusTimeoutPayload',
    payload: input.payload as Prisma.InputJsonValue,
  }));
}

export async function runMpesaReconciliationPass(limit = 25) {
  const staleRequests = await getStaleMpesaRequests(limit);
  const results = await Promise.allSettled(
    staleRequests.map(async (request) => {
      const reconciled = await reconcileMpesaStkRequest(request.id, { source: 'RECONCILIATION_JOB', force: true });
      if ((reconciled.status === 'SUCCESS' || reconciled.status === 'CALLBACK_RECEIVED') && reconciled.mpesaReceiptNumber) {
        await triggerTransactionStatusVerification(reconciled.id);
      }
      return reconciled;
    }),
  );

  return {
    scanned: staleRequests.length,
    reconciled: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
    errors: results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => (result.reason instanceof Error ? result.reason.message : 'Unknown reconciliation failure')),
  };
}
