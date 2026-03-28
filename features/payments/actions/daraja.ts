'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { getApplicationPortalReadiness, getApplicationPortalSetting } from '@/features/application/queries/settings';
import { reconcileMpesaStkRequest, triggerTransactionStatusVerification } from '@/features/payments/lib/daraja-reconciliation';
import { initiateDarajaStkPush } from '@/features/payments/lib/daraja';
import { buildPaymentSummary, buildRenewalPaymentSummary } from '@/features/payments/lib/payment-config';
import {
  adminPaymentRequestSchema,
  applicantMpesaStkSchema,
  type PaymentPurposeValue,
} from '@/features/payments/schemas/daraja';
import { getApplicantActivePaymentIntent, getLatestMemberRenewalRequest, getMemberActiveRenewalIntent } from '@/features/payments/queries/daraja';
import { db } from '@/lib/db';
import { Prisma } from '@/prisma/src/generated/prisma/client';

type DarajaActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  checkoutRequestId?: string;
  receiptNumber?: string;
};

function revalidatePaymentViews() {
  revalidatePath('/apply');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/applications');
}

function describeVerificationOutcome(input: {
  hadReceiptBefore: boolean;
  hasReceiptAfter: boolean;
  status: string;
  transactionStatusStarted: boolean;
}) {
  if (input.transactionStatusStarted) {
    return 'Payment check completed. A deeper provider status query is now waiting for the provider result callback.';
  }

  if ((input.status === 'SUCCESS' || input.status === 'VERIFIED') && (input.hadReceiptBefore || input.hasReceiptAfter)) {
    return input.status === 'VERIFIED'
      ? 'Payment was confirmed and independently verified.'
      : 'Payment was confirmed successfully.';
  }

  if (input.status === 'SUCCESS' || input.status === 'VERIFIED') {
    return 'Payment was confirmed successfully, but the provider has not exposed a receipt reference yet.';
  }

  if (input.status === 'INITIATED' || input.status === 'AWAITING_CALLBACK' || input.status === 'CALLBACK_RECEIVED') {
    return 'Payment status was checked, but the provider is still processing the request. Try again shortly.';
  }

  return `Payment status checked. Current state: ${input.status}.`;
}

function paymentPurposeLabel(purpose: PaymentPurposeValue, billingYear?: number | null) {
  return purpose === 'ANNUAL_RENEWAL'
    ? `annual renewal${billingYear ? ` for ${billingYear}` : ''}`
    : 'application fee';
}

function buildAccountReference(input: {
  purpose: PaymentPurposeValue;
  applicationId: string;
  membershipNumber?: string | null;
  billingYear?: number | null;
}) {
  const suffix = (input.membershipNumber ?? input.applicationId.slice(-6)).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-6);

  if (input.purpose === 'ANNUAL_RENEWAL') {
    const year = String(input.billingYear ?? new Date().getFullYear()).slice(-2);
    return `REN${year}-${suffix}`.slice(0, 20);
  }

  return `APP-${suffix}`.slice(0, 20);
}

function buildTransactionDescription(input: { purpose: PaymentPurposeValue; billingYear?: number | null }) {
  return input.purpose === 'ANNUAL_RENEWAL'
    ? `IGANO renewal ${input.billingYear ?? new Date().getFullYear()}`.slice(0, 40)
    : 'IGANO application fee';
}

async function runVerificationForRequest(requestId: string) {
  const request = await db.mpesaStkRequest.findUnique({
    where: { id: requestId },
    select: { id: true, mpesaReceiptNumber: true },
  });

  if (!request) {
    return { error: 'The selected payment request was not found.' };
  }

  try {
    const reconciled = await reconcileMpesaStkRequest(request.id, { source: 'MANUAL_VERIFY', force: true });
    let transactionStatusStarted = false;

    if (reconciled.status !== 'SUCCESS' && reconciled.status !== 'VERIFIED' && (request.mpesaReceiptNumber || reconciled.mpesaReceiptNumber)) {
      try {
        await triggerTransactionStatusVerification(request.id);
        transactionStatusStarted = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start the provider status query.';
        return {
          error: `Payment status was checked successfully, but the deeper status query could not start. ${message}`,
        };
      }
    }

    revalidatePaymentViews();

    return {
      success: describeVerificationOutcome({
        hadReceiptBefore: Boolean(request.mpesaReceiptNumber),
        hasReceiptAfter: Boolean(reconciled.mpesaReceiptNumber),
        status: reconciled.status,
        transactionStatusStarted,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const staleClient = message.includes('Unknown field') || message.includes('Invalid `') || message.includes('PrismaClientValidationError');

    return {
      error: staleClient
        ? 'Unable to verify the payment request right now because the payment client is still refreshing after the latest schema update. Refresh once or restart the dev server and try again.'
        : error instanceof Error
          ? `Unable to verify the payment request. ${error.message}`
          : 'Unable to verify the payment request right now.',
    };
  }
}

async function ensureApplicantPaymentIntent(input: {
  userId: string;
  phoneNumber: string;
  accountReference: string;
  paymentSummary: ReturnType<typeof buildPaymentSummary>;
}) {
  const existingIntent = await getApplicantActivePaymentIntent(input.userId);

  if (
    existingIntent &&
    existingIntent.totalAmount === input.paymentSummary.totalAmount &&
    existingIntent.currency === input.paymentSummary.currency &&
    existingIntent.collectionMode === 'MPESA_DARAJA' &&
    existingIntent.lockedAt === null
  ) {
    return db.paymentIntent.update({
      where: { id: existingIntent.id },
      data: {
        payerPhoneNumber: input.phoneNumber,
        accountReference: input.accountReference,
        verificationStatus: 'PENDING',
        verificationSource: null,
        paymentInitiatedAt: new Date(),
        baseAmount: input.paymentSummary.baseAmount,
        taxAmount: input.paymentSummary.taxAmount,
        totalAmount: input.paymentSummary.totalAmount,
        currency: input.paymentSummary.currency,
        status: 'AWAITING_PAYMENT',
        lastError: null,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  return db.paymentIntent.create({
    data: {
      userId: input.userId,
      purpose: 'APPLICATION_FEE',
      collectionMode: 'MPESA_DARAJA',
      provider: 'MPESA_DARAJA',
      paymentMethod: 'MPESA',
      accountReference: input.accountReference,
      payerPhoneNumber: input.phoneNumber,
      verificationStatus: 'PENDING',
      paymentInitiatedAt: new Date(),
      baseAmount: input.paymentSummary.baseAmount,
      taxAmount: input.paymentSummary.taxAmount,
      totalAmount: input.paymentSummary.totalAmount,
      currency: input.paymentSummary.currency,
      status: 'AWAITING_PAYMENT',
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
}

async function ensureAdminPaymentIntent(input: {
  applicationId: string;
  userId: string;
  purpose: PaymentPurposeValue;
  billingYear?: number | null;
  phoneNumber: string;
  amount: number;
  currency: string;
  accountReference: string;
}) {
  if (input.purpose === 'APPLICATION_FEE') {
    const existingIntent = await db.paymentIntent.findFirst({
      where: { applicationId: input.applicationId, purpose: 'APPLICATION_FEE' },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (existingIntent?.status === 'LOCKED' || existingIntent?.status === 'VERIFIED') {
      throw new Error('This application already has a confirmed application-fee payment. Use manual record only if you are correcting the ledger.');
    }

    if (existingIntent) {
      return db.paymentIntent.update({
        where: { id: existingIntent.id },
        data: {
          payerPhoneNumber: input.phoneNumber,
          accountReference: input.accountReference,
          verificationStatus: 'PENDING',
          verificationSource: null,
          paymentInitiatedAt: new Date(),
          baseAmount: input.amount,
          taxAmount: 0,
          totalAmount: input.amount,
          currency: input.currency,
          status: 'AWAITING_PAYMENT',
          lastError: null,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
    }

    return db.paymentIntent.create({
      data: {
        userId: input.userId,
        purpose: 'APPLICATION_FEE',
        applicationId: input.applicationId,
        collectionMode: 'MPESA_DARAJA',
        provider: 'MPESA_DARAJA',
        paymentMethod: 'MPESA',
        accountReference: input.accountReference,
        payerPhoneNumber: input.phoneNumber,
        verificationStatus: 'PENDING',
        paymentInitiatedAt: new Date(),
        baseAmount: input.amount,
        taxAmount: 0,
        totalAmount: input.amount,
        currency: input.currency,
        status: 'AWAITING_PAYMENT',
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  const existingIntent = await db.paymentIntent.findFirst({
    where: {
      membershipApplicationId: input.applicationId,
      purpose: 'ANNUAL_RENEWAL',
      billingYear: input.billingYear ?? null,
      lockedAt: null,
      status: {
        in: ['CREATED', 'AWAITING_PAYMENT', 'FAILED', 'CANCELLED', 'EXPIRED'],
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  if (existingIntent) {
    return db.paymentIntent.update({
      where: { id: existingIntent.id },
      data: {
        payerPhoneNumber: input.phoneNumber,
        accountReference: input.accountReference,
        verificationStatus: 'PENDING',
        verificationSource: null,
        paymentInitiatedAt: new Date(),
        baseAmount: input.amount,
        taxAmount: 0,
        totalAmount: input.amount,
        currency: input.currency,
        status: 'AWAITING_PAYMENT',
        lastError: null,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  return db.paymentIntent.create({
    data: {
      userId: input.userId,
      purpose: 'ANNUAL_RENEWAL',
      membershipApplicationId: input.applicationId,
      billingYear: input.billingYear ?? null,
      collectionMode: 'MPESA_DARAJA',
      provider: 'MPESA_DARAJA',
      paymentMethod: 'MPESA',
      accountReference: input.accountReference,
      payerPhoneNumber: input.phoneNumber,
      verificationStatus: 'PENDING',
      paymentInitiatedAt: new Date(),
      baseAmount: input.amount,
      taxAmount: 0,
      totalAmount: input.amount,
      currency: input.currency,
      status: 'AWAITING_PAYMENT',
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
}


async function ensureMemberRenewalIntent(input: {
  applicationId: string;
  userId: string;
  phoneNumber: string;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  billingYear: number;
  accountReference: string;
}) {
  const existingIntent = await getMemberActiveRenewalIntent(input.userId, input.billingYear);

  if (existingIntent?.status === 'LOCKED') {
    throw new Error(`This membership already has a confirmed renewal payment for ${input.billingYear}.`);
  }

  if (existingIntent) {
    return db.paymentIntent.update({
      where: { id: existingIntent.id },
      data: {
        payerPhoneNumber: input.phoneNumber,
        accountReference: input.accountReference,
        verificationStatus: 'PENDING',
        verificationSource: null,
        paymentInitiatedAt: new Date(),
        baseAmount: input.baseAmount,
        taxAmount: input.taxAmount,
        totalAmount: input.totalAmount,
        currency: input.currency,
        status: 'AWAITING_PAYMENT',
        lastError: null,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  return db.paymentIntent.create({
    data: {
      userId: input.userId,
      purpose: 'ANNUAL_RENEWAL',
      membershipApplicationId: input.applicationId,
      billingYear: input.billingYear,
      collectionMode: 'MPESA_DARAJA',
      provider: 'MPESA_DARAJA',
      paymentMethod: 'MPESA',
      accountReference: input.accountReference,
      payerPhoneNumber: input.phoneNumber,
      verificationStatus: 'PENDING',
      paymentInitiatedAt: new Date(),
      baseAmount: input.baseAmount,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      currency: input.currency,
      status: 'AWAITING_PAYMENT',
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
}

export async function initiateAdminPaymentRequest(
  _prevState: DarajaActionState,
  formData: FormData,
): Promise<DarajaActionState> {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    return { error: 'Unauthorized' };
  }

  const readiness = await getApplicationPortalReadiness();
  const paymentSummary = buildPaymentSummary(readiness.setting);

  const parsed = adminPaymentRequestSchema.safeParse({
    applicationId: formData.get('applicationId'),
    purpose: formData.get('purpose') || 'APPLICATION_FEE',
    phoneNumber: formData.get('phoneNumber'),
    amount: formData.get('amount'),
    billingYear: String(formData.get('billingYear') ?? '').trim() || undefined,
  });

  if (!parsed.success) {
    return {
      error: 'Payment request could not be started.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const target = await db.membershipApplication.findUnique({
      where: { id: parsed.data.applicationId },
      select: {
        id: true,
        userId: true,
        status: true,
        firstName: true,
        surname: true,
        email: true,
        membershipNumber: true,
        currency: true,
      },
    });

    if (!target) {
      return {
        error: 'Select a valid applicant or member from the list.',
        fieldErrors: { applicationId: ['Select a valid applicant or member.'] },
      };
    }

    if (parsed.data.purpose === 'APPLICATION_FEE' && target.status === 'ACTIVE') {
      return {
        error: 'Application fee requests should only be used for applicants who are not yet active members.',
        fieldErrors: { purpose: ['Use annual renewal for active members.'] },
      };
    }

    if (parsed.data.purpose === 'ANNUAL_RENEWAL' && target.status !== 'ACTIVE') {
      return {
        error: 'Annual renewal requests can only be sent to active members.',
        fieldErrors: { purpose: ['Select an active member for annual renewal.'] },
      };
    }

    const billingYear = parsed.data.purpose === 'ANNUAL_RENEWAL'
      ? parsed.data.billingYear ?? new Date().getFullYear()
      : null;
    const accountReference = buildAccountReference({
      purpose: parsed.data.purpose,
      applicationId: target.id,
      membershipNumber: target.membershipNumber,
      billingYear,
    });
    const transactionDesc = buildTransactionDescription({ purpose: parsed.data.purpose, billingYear });
    const paymentIntent = await ensureAdminPaymentIntent({
      applicationId: target.id,
      userId: target.userId,
      purpose: parsed.data.purpose,
      billingYear,
      phoneNumber: parsed.data.phoneNumber,
      amount: parsed.data.amount,
      currency: target.currency ?? paymentSummary.currency,
      accountReference,
    });

    const stk = await initiateDarajaStkPush({
      phoneNumber: parsed.data.phoneNumber,
      amount: parsed.data.amount,
      accountReference,
      transactionDesc,
      shortCode: paymentSummary.mpesaShortCode,
      transactionType: paymentSummary.darajaTransactionType,
    });

    await db.mpesaStkRequest.create({
      data: {
        paymentIntentId: paymentIntent.id,
        applicationId: target.id,
        userId: target.userId,
        phoneNumber: parsed.data.phoneNumber,
        amount: parsed.data.amount,
        baseAmount: parsed.data.amount,
        taxAmount: 0,
        currency: target.currency ?? paymentSummary.currency,
        accountReference,
        transactionDesc,
        merchantRequestId: stk.response.MerchantRequestID || null,
        checkoutRequestId: stk.response.CheckoutRequestID || null,
        customerMessage: stk.response.CustomerMessage || null,
        callbackUrl: stk.callbackUrl,
        status: 'AWAITING_CALLBACK',
        nextReconciliationAt: new Date(Date.now() + 15_000),
        lastReconciliationSource: 'MANUAL_VERIFY',
        lastReconciliationNote: `Payment request sent for ${paymentPurposeLabel(parsed.data.purpose, billingYear)}.`,
        requestPayload: stk.payload as Prisma.InputJsonValue,
        responsePayload: stk.response as Prisma.InputJsonValue,
      },
    });

    revalidatePaymentViews();

    return {
      success: `${target.firstName} ${target.surname}`.trim()
        ? `Payment request sent to ${target.firstName} ${target.surname} for ${paymentPurposeLabel(parsed.data.purpose, billingYear)}.`
        : `Payment request sent for ${paymentPurposeLabel(parsed.data.purpose, billingYear)}.`,
      checkoutRequestId: stk.response.CheckoutRequestID || undefined,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Payment request failed.' };
  }
}

export async function initiateApplicantStkPush(
  _prevState: DarajaActionState,
  formData: FormData,
): Promise<DarajaActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Sign in is required before you can start the M-Pesa payment.' };
  }

  const readiness = await getApplicationPortalReadiness();
  if (!readiness.isReady) {
    return { error: readiness.applicantMessage };
  }

  const paymentSummary = buildPaymentSummary(readiness.setting);
  if (paymentSummary.collectionMode !== 'MPESA_DARAJA') {
    return { error: 'M-Pesa is not currently enabled for applications.' };
  }

  const parsed = applicantMpesaStkSchema.safeParse({
    phoneNumber: formData.get('payerPhoneNumber'),
  });

  if (!parsed.success) {
    return {
      error: 'Enter a valid Safaricom number to receive the payment prompt.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const accountReference = `${paymentSummary.mpesaBusinessName ?? 'IGANO'}-${session.user.id.slice(-6).toUpperCase()}`.slice(0, 20);
    const paymentIntent = await ensureApplicantPaymentIntent({
      userId: session.user.id,
      phoneNumber: parsed.data.phoneNumber,
      accountReference,
      paymentSummary,
    });

    const stk = await initiateDarajaStkPush({
      phoneNumber: parsed.data.phoneNumber,
      amount: paymentSummary.totalAmount,
      accountReference,
      transactionDesc: paymentSummary.includeRenewalFeeInApplication ? 'IGANO registration and renewal fee' : 'IGANO application fee',
      shortCode: paymentSummary.mpesaShortCode,
      transactionType: paymentSummary.darajaTransactionType,
    });

    await db.mpesaStkRequest.create({
      data: {
        paymentIntentId: paymentIntent.id,
        userId: session.user.id,
        phoneNumber: parsed.data.phoneNumber,
        amount: paymentSummary.totalAmount,
        baseAmount: paymentSummary.baseAmount,
        taxAmount: paymentSummary.taxAmount,
        currency: paymentSummary.currency,
        accountReference,
        transactionDesc: paymentSummary.includeRenewalFeeInApplication ? 'IGANO registration and renewal fee' : 'IGANO application fee',
        merchantRequestId: stk.response.MerchantRequestID || null,
        checkoutRequestId: stk.response.CheckoutRequestID || null,
        customerMessage: stk.response.CustomerMessage || null,
        callbackUrl: stk.callbackUrl,
        status: 'AWAITING_CALLBACK',
        nextReconciliationAt: new Date(Date.now() + 15_000),
        lastReconciliationSource: 'MANUAL_VERIFY',
        lastReconciliationNote: 'Payment prompt submitted. Waiting for update or verification query.',
        requestPayload: stk.payload as Prisma.InputJsonValue,
        responsePayload: stk.response as Prisma.InputJsonValue,
      },
    });

    revalidatePaymentViews();

    return {
      success: stk.response.CustomerMessage || 'Payment prompt sent. Complete it on your phone, then submit the application.',
      checkoutRequestId: stk.response.CheckoutRequestID || undefined,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to start the M-Pesa payment right now.' };
  }
}


export async function initiateMemberRenewalStkPush(
  _prevState: DarajaActionState,
  formData: FormData,
): Promise<DarajaActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Sign in is required before you can request renewal payment.' };
  }

  const [setting, application] = await Promise.all([
    getApplicationPortalSetting(),
    db.membershipApplication.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        userId: true,
        status: true,
        membershipNumber: true,
        currency: true,
      },
    }),
  ]);

  const renewalSummary = buildRenewalPaymentSummary(setting);
  if (!renewalSummary.renewalsEnabled) {
    return { error: 'Annual renewals are not enabled right now.' };
  }

  if (renewalSummary.collectionMode !== 'MPESA_DARAJA') {
    return { error: 'Member renewal prompts are currently handled by the admin team.' };
  }

  if (!application || application.status !== 'ACTIVE') {
    return { error: 'Only active members can start a renewal payment.' };
  }

  const parsed = applicantMpesaStkSchema.safeParse({
    phoneNumber: formData.get('phoneNumber') ?? formData.get('payerPhoneNumber'),
  });

  if (!parsed.success) {
    return {
      error: 'Enter a valid Safaricom number to receive the renewal payment prompt.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const billingYear = new Date().getFullYear();
    const accountReference = buildAccountReference({
      purpose: 'ANNUAL_RENEWAL',
      applicationId: application.id,
      membershipNumber: application.membershipNumber,
      billingYear,
    });
    const paymentIntent = await ensureMemberRenewalIntent({
      applicationId: application.id,
      userId: application.userId,
      phoneNumber: parsed.data.phoneNumber,
      baseAmount: renewalSummary.annualRenewalFee,
      taxAmount: renewalSummary.taxAmount,
      totalAmount: renewalSummary.totalAmount,
      currency: application.currency ?? renewalSummary.currency,
      billingYear,
      accountReference,
    });

    const stk = await initiateDarajaStkPush({
      phoneNumber: parsed.data.phoneNumber,
      amount: renewalSummary.totalAmount,
      accountReference,
      transactionDesc: buildTransactionDescription({ purpose: 'ANNUAL_RENEWAL', billingYear }),
      shortCode: renewalSummary.mpesaShortCode,
      transactionType: renewalSummary.darajaTransactionType,
    });

    await db.mpesaStkRequest.create({
      data: {
        paymentIntentId: paymentIntent.id,
        applicationId: application.id,
        userId: session.user.id,
        phoneNumber: parsed.data.phoneNumber,
        amount: renewalSummary.totalAmount,
        baseAmount: renewalSummary.annualRenewalFee,
        taxAmount: renewalSummary.taxAmount,
        currency: application.currency ?? renewalSummary.currency,
        accountReference,
        transactionDesc: buildTransactionDescription({ purpose: 'ANNUAL_RENEWAL', billingYear }),
        merchantRequestId: stk.response.MerchantRequestID || null,
        checkoutRequestId: stk.response.CheckoutRequestID || null,
        customerMessage: stk.response.CustomerMessage || null,
        callbackUrl: stk.callbackUrl,
        status: 'AWAITING_CALLBACK',
        nextReconciliationAt: new Date(Date.now() + 15_000),
        lastReconciliationSource: 'MANUAL_VERIFY',
        lastReconciliationNote: `Renewal payment prompt submitted for ${billingYear}.`,
        requestPayload: stk.payload as Prisma.InputJsonValue,
        responsePayload: stk.response as Prisma.InputJsonValue,
      },
    });

    revalidatePaymentViews();

    return {
      success: stk.response.CustomerMessage || `Renewal payment prompt sent for ${billingYear}.`,
      checkoutRequestId: stk.response.CheckoutRequestID || undefined,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to start the renewal payment right now.' };
  }
}

export async function verifyLatestMemberRenewalPaymentNow() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const latestRequest = await getLatestMemberRenewalRequest(session.user.id, new Date().getFullYear());

  if (!latestRequest) {
    return { error: 'No renewal payment attempt was found for this account.' };
  }

  return runVerificationForRequest(latestRequest.id);
}

export async function verifyLatestApplicantPaymentNow() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const latestRequest = await db.mpesaStkRequest.findFirst({
    where: { userId: session.user.id },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });

  if (!latestRequest) {
    return { error: 'No M-Pesa payment attempt was found for this account.' };
  }

  return runVerificationForRequest(latestRequest.id);
}

export async function verifyMpesaRequestNow(requestId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { error: 'Unauthorized' };
  }

  return runVerificationForRequest(requestId);
}
