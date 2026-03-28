'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { initiateDarajaStkPush } from '@/features/payments/lib/daraja';
import { manuallyVerifyMpesaRequest, reconcileMpesaStkRequest, runMpesaReconciliationPass } from '@/features/payments/lib/daraja-reconciliation';
import { openPaymentIncident } from '@/features/payments/lib/ledger';
import { adminManualPaymentRecordSchema, type PaymentPurposeValue } from '@/features/payments/schemas/daraja';
import { db } from '@/lib/db';
import { Prisma } from '@/prisma/src/generated/prisma/client';

function ensureAdmin(session: { user?: { role?: string; id?: string } } | null) {
  if (!session?.user || session.user.role !== 'ADMIN' || !session.user.id) {
    throw new Error('Unauthorized');
  }

  return session.user.id;
}

function refreshPaymentOperationsViews() {
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/applications');
}

function paymentPurposeLabel(purpose: PaymentPurposeValue, billingYear?: number | null) {
  return purpose === 'ANNUAL_RENEWAL'
    ? `annual renewal${billingYear ? ` for ${billingYear}` : ''}`
    : 'application fee';
}

function buildManualIntentReference(input: { purpose: PaymentPurposeValue; applicationId: string; membershipNumber?: string | null; billingYear?: number | null }) {
  const suffix = (input.membershipNumber ?? input.applicationId.slice(-6)).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-6);

  if (input.purpose === 'ANNUAL_RENEWAL') {
    const year = String(input.billingYear ?? new Date().getFullYear()).slice(-2);
    return `REN${year}-${suffix}`.slice(0, 20);
  }

  return `APP-${suffix}`.slice(0, 20);
}

export async function runPaymentReconciliationNow() {
  const session = await auth();
  ensureAdmin(session);

  await runMpesaReconciliationPass(50);
  refreshPaymentOperationsViews();
}

export async function reconcilePaymentRequestNow(requestId: string) {
  const session = await auth();
  ensureAdmin(session);

  await reconcileMpesaStkRequest(requestId, { source: 'MANUAL_VERIFY', force: true });
  refreshPaymentOperationsViews();
}

export async function resendPaymentRequestNow(requestId: string) {
  const session = await auth();
  ensureAdmin(session);

  const request = await db.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      userId: true,
      applicationId: true,
      paymentIntentId: true,
      phoneNumber: true,
      amount: true,
      baseAmount: true,
      taxAmount: true,
      currency: true,
      accountReference: true,
      transactionDesc: true,
      status: true,
      requestPayload: true,
    },
  });

  if (!request) {
    throw new Error('Payment request not found.');
  }

  if (request.status === 'SUCCESS' || request.status === 'VERIFIED') {
    throw new Error('Successful payments cannot be resent.');
  }

  const businessShortCode =
    typeof request.requestPayload === 'object' && request.requestPayload && 'BusinessShortCode' in request.requestPayload
      ? String((request.requestPayload as Record<string, unknown>).BusinessShortCode ?? '')
      : null;
  const transactionType =
    typeof request.requestPayload === 'object' && request.requestPayload && 'TransactionType' in request.requestPayload
      ? String((request.requestPayload as Record<string, unknown>).TransactionType ?? '')
      : null;

  const stk = await initiateDarajaStkPush({
    phoneNumber: request.phoneNumber,
    amount: request.amount,
    accountReference: request.accountReference,
    transactionDesc: request.transactionDesc,
    shortCode: businessShortCode || undefined,
    transactionType: transactionType === 'CustomerBuyGoodsOnline' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
  });

  await db.$transaction(async (tx) => {
    await tx.mpesaStkRequest.create({
      data: {
        paymentIntentId: request.paymentIntentId,
        applicationId: request.applicationId,
        userId: request.userId,
        phoneNumber: request.phoneNumber,
        amount: request.amount,
        baseAmount: request.baseAmount,
        taxAmount: request.taxAmount,
        currency: request.currency,
        accountReference: request.accountReference,
        transactionDesc: request.transactionDesc,
        merchantRequestId: stk.response.MerchantRequestID || null,
        checkoutRequestId: stk.response.CheckoutRequestID || null,
        customerMessage: stk.response.CustomerMessage || null,
        callbackUrl: stk.callbackUrl,
        status: 'AWAITING_CALLBACK',
        nextReconciliationAt: new Date(Date.now() + 15_000),
        lastReconciliationSource: 'MANUAL_VERIFY',
        lastReconciliationNote: 'Payment prompt resent by admin. Waiting for update or verification query.',
        requestPayload: stk.payload as Prisma.InputJsonValue,
        responsePayload: stk.response as Prisma.InputJsonValue,
      },
    });

    if (request.paymentIntentId) {
      await tx.paymentIntent.update({
        where: { id: request.paymentIntentId },
        data: {
          status: 'AWAITING_PAYMENT',
          verificationStatus: 'PENDING',
          verificationSource: 'MANUAL_ADMIN',
          paymentInitiatedAt: new Date(),
          providerReference: stk.response.CheckoutRequestID || null,
          checkoutRequestId: stk.response.CheckoutRequestID || null,
          lastError: null,
        },
      });
    }

    await openPaymentIncident(tx, {
      type: 'STK_RESENT',
      severity: 'INFO',
      title: 'Payment prompt resent by admin',
      detail: `A new payment prompt was initiated for ${request.phoneNumber}.`,
      userId: request.userId,
      applicationId: request.applicationId,
      paymentIntentId: request.paymentIntentId,
      metadata: stk.response as Prisma.InputJsonValue,
    });
  });

  refreshPaymentOperationsViews();
}

export async function manuallyVerifyPaymentRequestNow(requestId: string) {
  const session = await auth();
  ensureAdmin(session);

  await manuallyVerifyMpesaRequest(requestId);
  refreshPaymentOperationsViews();
}

export async function markPaymentRequestForManualFollowUp(requestId: string, context?: string) {
  const session = await auth();
  ensureAdmin(session);

  const request = await db.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: { id: true, userId: true, applicationId: true, paymentIntentId: true },
  });

  if (!request) {
    throw new Error('Payment request not found.');
  }

  const timestamp = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const note = context
    ? `Flagged for manual follow-up by admin on ${timestamp}. Context: ${context}.`
    : `Flagged for manual follow-up by admin on ${timestamp}.`;

  await db.$transaction(async (tx) => {
    await tx.mpesaStkRequest.update({
      where: { id: request.id },
      data: {
        lastReconciledAt: new Date(),
        lastReconciliationSource: 'MANUAL_VERIFY',
        lastReconciliationNote: note,
      },
    });

    await openPaymentIncident(tx, {
      type: 'MANUAL_FOLLOW_UP',
      severity: 'WARNING',
      title: 'Payment flagged for manual follow-up',
      detail: note,
      userId: request.userId,
      applicationId: request.applicationId,
      paymentIntentId: request.paymentIntentId,
      mpesaRequestId: request.id,
    });
  });

  refreshPaymentOperationsViews();
}

export async function recordAdminPayment(
  _prevState: { error?: string; success?: string; fieldErrors?: Record<string, string[] | undefined> },
  formData: FormData,
) {
  const session = await auth();
  const adminId = ensureAdmin(session);

  const parsed = adminManualPaymentRecordSchema.safeParse({
    applicationId: formData.get('applicationId'),
    purpose: formData.get('purpose') || 'APPLICATION_FEE',
    billingYear: String(formData.get('billingYear') ?? '').trim() || undefined,
    paymentMethod: formData.get('paymentMethod'),
    status: formData.get('status') || 'VERIFIED',
    transactionReferenceNumber: formData.get('transactionReferenceNumber'),
    paidAt: formData.get('paidAt'),
    amount: formData.get('amount'),
    payerPhoneNumber: typeof formData.get('payerPhoneNumber') === 'string' ? String(formData.get('payerPhoneNumber')).trim() || undefined : undefined,
    notes: typeof formData.get('notes') === 'string' ? String(formData.get('notes')).trim() || undefined : undefined,
  });

  if (!parsed.success) {
    return {
      error: 'Payment record could not be saved.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const target = await db.membershipApplication.findUnique({
    where: { id: parsed.data.applicationId },
    select: {
      id: true,
      userId: true,
      status: true,
      membershipNumber: true,
      currency: true,
    },
  });

  if (!target) {
    return { error: 'Applicant or member not found.' };
  }

  if (parsed.data.purpose === 'APPLICATION_FEE' && target.status === 'ACTIVE') {
    return {
      error: 'Application fee records should only be used for applicants who are not yet active members.',
      fieldErrors: { purpose: ['Use annual renewal for active members.'] },
    };
  }

  if (parsed.data.purpose === 'ANNUAL_RENEWAL' && target.status !== 'ACTIVE') {
    return {
      error: 'Annual renewal records can only be saved for active members.',
      fieldErrors: { purpose: ['Select an active member for annual renewal.'] },
    };
  }

  const existingRecord = await db.membershipPaymentRecord.findFirst({
    where: {
      applicationId: target.id,
      transactionReferenceNumber: parsed.data.transactionReferenceNumber,
    },
    select: { id: true },
  });

  if (existingRecord) {
    return {
      error: 'That transaction reference already exists for this member record.',
      fieldErrors: { transactionReferenceNumber: ['Use a unique transaction reference number.'] },
    };
  }

  const billingYear = parsed.data.purpose === 'ANNUAL_RENEWAL'
    ? parsed.data.billingYear ?? new Date().getFullYear()
    : null;

  await db.$transaction(async (tx) => {
    let paymentIntentId: string | null = null;

    if (parsed.data.purpose === 'APPLICATION_FEE') {
      const existingIntent = await tx.paymentIntent.findFirst({
        where: { applicationId: target.id, purpose: 'APPLICATION_FEE' },
        select: { id: true },
      });

      const intentData = {
        userId: target.userId,
        purpose: 'APPLICATION_FEE' as const,
        applicationId: target.id,
        collectionMode: 'MANUAL_PROOF' as const,
        provider: 'MANUAL' as const,
        paymentMethod: parsed.data.paymentMethod,
        accountReference: buildManualIntentReference({ purpose: parsed.data.purpose, applicationId: target.id, membershipNumber: target.membershipNumber }),
        providerReference: parsed.data.transactionReferenceNumber,
        payerPhoneNumber: parsed.data.payerPhoneNumber || null,
        baseAmount: parsed.data.amount,
        taxAmount: 0,
        totalAmount: parsed.data.amount,
        currency: target.currency ?? 'KES',
        status: parsed.data.status === 'REJECTED' ? 'FAILED' as const : 'LOCKED' as const,
        verificationStatus: parsed.data.status === 'VERIFIED' ? 'VERIFIED' as const : parsed.data.status === 'REJECTED' ? 'FAILED' as const : 'MANUAL_REVIEW' as const,
        verificationSource: 'MANUAL_RECORDED' as const,
        verifiedAt: parsed.data.status === 'VERIFIED' ? parsed.data.paidAt : null,
        lockedAt: parsed.data.status === 'VERIFIED' ? parsed.data.paidAt : null,
        lastVerifiedAt: parsed.data.paidAt,
        mpesaReceiptNumber: parsed.data.paymentMethod === 'MPESA' ? parsed.data.transactionReferenceNumber : null,
        lastError: parsed.data.status === 'REJECTED' ? 'Manual record marked as rejected.' : null,
      };

      const intent = existingIntent
        ? await tx.paymentIntent.update({ where: { id: existingIntent.id }, data: intentData })
        : await tx.paymentIntent.create({ data: intentData });

      paymentIntentId = intent.id;
    } else {
      const intent = await tx.paymentIntent.create({
        data: {
          userId: target.userId,
          purpose: 'ANNUAL_RENEWAL',
          membershipApplicationId: target.id,
          billingYear,
          collectionMode: 'MANUAL_PROOF',
          provider: 'MANUAL',
          paymentMethod: parsed.data.paymentMethod,
          accountReference: buildManualIntentReference({
            purpose: parsed.data.purpose,
            applicationId: target.id,
            membershipNumber: target.membershipNumber,
            billingYear,
          }),
          providerReference: parsed.data.transactionReferenceNumber,
          payerPhoneNumber: parsed.data.payerPhoneNumber || null,
          baseAmount: parsed.data.amount,
          taxAmount: 0,
          totalAmount: parsed.data.amount,
          currency: target.currency ?? 'KES',
          status: parsed.data.status === 'REJECTED' ? 'FAILED' : 'LOCKED',
          verificationStatus: parsed.data.status === 'VERIFIED' ? 'VERIFIED' : parsed.data.status === 'REJECTED' ? 'FAILED' : 'MANUAL_REVIEW',
          verificationSource: 'MANUAL_RECORDED',
          verifiedAt: parsed.data.status === 'VERIFIED' ? parsed.data.paidAt : null,
          lockedAt: parsed.data.status === 'VERIFIED' ? parsed.data.paidAt : null,
          lastVerifiedAt: parsed.data.paidAt,
          mpesaReceiptNumber: parsed.data.paymentMethod === 'MPESA' ? parsed.data.transactionReferenceNumber : null,
          lastError: parsed.data.status === 'REJECTED' ? 'Manual record marked as rejected.' : null,
        },
      });

      paymentIntentId = intent.id;
    }

    await tx.membershipPaymentRecord.create({
      data: {
        applicationId: target.id,
        purpose: parsed.data.purpose,
        billingYear,
        paymentIntentId,
        collectionMode: 'MANUAL_PROOF',
        provider: 'MANUAL',
        paymentMethod: parsed.data.paymentMethod,
        transactionReferenceNumber: parsed.data.transactionReferenceNumber,
        providerReference: parsed.data.transactionReferenceNumber,
        externalReference: parsed.data.transactionReferenceNumber,
        payerPhoneNumber: parsed.data.payerPhoneNumber || null,
        amount: parsed.data.amount,
        baseAmount: parsed.data.amount,
        taxAmount: 0,
        totalAmount: parsed.data.amount,
        currency: target.currency ?? 'KES',
        verificationStatus: parsed.data.status === 'VERIFIED' ? 'VERIFIED' : parsed.data.status === 'REJECTED' ? 'FAILED' : 'MANUAL_REVIEW',
        verificationSource: 'MANUAL_RECORDED',
        description: paymentPurposeLabel(parsed.data.purpose, billingYear),
        notes: parsed.data.notes || null,
        status: parsed.data.status,
        verifiedAt: parsed.data.status === 'VERIFIED' ? parsed.data.paidAt : null,
        paidAt: parsed.data.paidAt,
        recordedById: adminId,
      },
    });

    await openPaymentIncident(tx, {
      type: parsed.data.purpose === 'ANNUAL_RENEWAL' ? 'RENEWAL_PAYMENT_RECORDED' : 'APPLICATION_PAYMENT_RECORDED',
      severity: 'INFO',
      title: 'Payment recorded manually by admin',
      detail: `A ${paymentPurposeLabel(parsed.data.purpose, billingYear)} was recorded manually.`,
      userId: target.userId,
      applicationId: target.id,
      paymentIntentId,
    });
  });

  refreshPaymentOperationsViews();

  return {
    success: `Payment recorded for ${paymentPurposeLabel(parsed.data.purpose, billingYear)}.`,
  };
}


export async function grantRenewalAccessNow(paymentIntentId: string) {
  const session = await auth();
  ensureAdmin(session);

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    select: {
      id: true,
      purpose: true,
      membershipApplicationId: true,
      billingYear: true,
      verifiedAt: true,
      status: true,
    },
  });

  if (!intent || intent.purpose !== 'ANNUAL_RENEWAL' || !intent.membershipApplicationId) {
    throw new Error('Renewal payment intent not found.');
  }

  if (intent.status !== 'VERIFIED' && intent.status !== 'LOCKED') {
    throw new Error('Only verified renewal payments can be approved for access.');
  }

  await db.$transaction(async (tx) => {
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'LOCKED',
        lockedAt: intent.verifiedAt ?? new Date(),
        verificationStatus: 'VERIFIED',
        verificationSource: 'MANUAL_ADMIN',
      },
    });

    await tx.membershipPaymentRecord.updateMany({
      where: {
        paymentIntentId: intent.id,
        applicationId: intent.membershipApplicationId ?? undefined,
        purpose: 'ANNUAL_RENEWAL',
        billingYear: intent.billingYear ?? null,
      },
      data: {
        status: 'VERIFIED',
        verificationStatus: 'VERIFIED',
        verificationSource: 'MANUAL_ADMIN',
        verifiedAt: intent.verifiedAt ?? new Date(),
        notes: 'Renewal payment approved by admin and access restored.',
      },
    });

    await tx.paymentIncident.updateMany({
      where: {
        paymentIntentId: intent.id,
        type: 'RENEWAL_REVIEW_REQUIRED',
        status: 'OPEN',
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolutionNote: 'Renewal access granted by admin.',
      },
    });
  });

  refreshPaymentOperationsViews();
}

export async function resolvePaymentIncidentNow(incidentId: string) {
  const session = await auth();
  ensureAdmin(session);

  await db.paymentIncident.update({
    where: { id: incidentId },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolutionNote: 'Resolved manually by an administrator.',
    },
  });

  refreshPaymentOperationsViews();
}

