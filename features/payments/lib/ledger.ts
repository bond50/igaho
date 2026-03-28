import type { Prisma, PrismaClient, PaymentCollectionMode, PaymentMethod, PaymentProvider, PaymentVerificationSource, PaymentVerificationStatus, MemberPaymentStatus, PaymentIncidentSeverity } from '@/prisma/src/generated/prisma/client';

function getPaymentProvider(collectionMode: PaymentCollectionMode): PaymentProvider {
  return collectionMode === 'MPESA_DARAJA' ? 'MPESA_DARAJA' : 'MANUAL';
}

type PaymentLedgerInput = {
  applicationId: string;
  purpose?: 'APPLICATION_FEE' | 'ANNUAL_RENEWAL';
  billingYear?: number | null;
  paymentIntentId?: string | null;
  collectionMode: PaymentCollectionMode;
  paymentMethod: PaymentMethod;
  transactionReferenceNumber: string;
  providerReference?: string | null;
  externalReference?: string | null;
  checkoutRequestId?: string | null;
  merchantRequestId?: string | null;
  payerPhoneNumber?: string | null;
  amount?: number | null;
  baseAmount?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  currency: string;
  verificationStatus: PaymentVerificationStatus;
  verificationSource?: PaymentVerificationSource | null;
  rawRequestPayload?: Prisma.InputJsonValue | null;
  rawCallbackPayload?: Prisma.InputJsonValue | null;
  reconciliationPayload?: Prisma.InputJsonValue | null;
  description?: string | null;
  notes?: string | null;
  proofUrl?: string | null;
  proofOriginalName?: string | null;
  status: MemberPaymentStatus;
  initiatedAt?: Date | null;
  callbackReceivedAt?: Date | null;
  verifiedAt?: Date | null;
  paidAt?: Date | null;
  recordedById?: string | null;
};



type BundledApplicationLedgerInput = {
  applicationId: string;
  billingYear: number;
  paymentIntentId?: string | null;
  collectionMode: PaymentCollectionMode;
  paymentMethod: PaymentMethod;
  transactionReferenceNumber: string;
  providerReference?: string | null;
  externalReference?: string | null;
  checkoutRequestId?: string | null;
  merchantRequestId?: string | null;
  payerPhoneNumber?: string | null;
  currency: string;
  status: MemberPaymentStatus;
  verificationStatus: PaymentVerificationStatus;
  verificationSource?: PaymentVerificationSource | null;
  proofUrl?: string | null;
  proofOriginalName?: string | null;
  paidAt?: Date | null;
  verifiedAt?: Date | null;
  recordedById?: string | null;
  notes?: string | null;
  applicationBaseAmount: number;
  applicationTaxAmount: number;
  renewalBaseAmount?: number;
  renewalTaxAmount?: number;
  renewalDescription?: string | null;
  applicationDescription?: string | null;
};

export async function upsertBundledApplicationLedgerRecords(
  tx: Prisma.TransactionClient | PrismaClient,
  input: BundledApplicationLedgerInput,
) {
  const applicationTotal = input.applicationBaseAmount + input.applicationTaxAmount;
  const renewalBaseAmount = input.renewalBaseAmount ?? 0;
  const renewalTaxAmount = input.renewalTaxAmount ?? 0;
  const renewalTotal = renewalBaseAmount + renewalTaxAmount;

  await upsertPaymentLedgerRecord(tx, {
    applicationId: input.applicationId,
    purpose: 'APPLICATION_FEE',
    billingYear: null,
    paymentIntentId: input.paymentIntentId ?? null,
    collectionMode: input.collectionMode,
    paymentMethod: input.paymentMethod,
    transactionReferenceNumber: input.transactionReferenceNumber,
    providerReference: input.providerReference ?? null,
    externalReference: input.externalReference ?? null,
    checkoutRequestId: input.checkoutRequestId ?? null,
    merchantRequestId: input.merchantRequestId ?? null,
    payerPhoneNumber: input.payerPhoneNumber ?? null,
    amount: applicationTotal,
    baseAmount: input.applicationBaseAmount,
    taxAmount: input.applicationTaxAmount,
    totalAmount: applicationTotal,
    currency: input.currency,
    verificationStatus: input.verificationStatus,
    verificationSource: input.verificationSource ?? null,
    description: input.applicationDescription ?? 'Application fee',
    notes: input.notes ?? null,
    proofUrl: input.proofUrl ?? null,
    proofOriginalName: input.proofOriginalName ?? null,
    status: input.status,
    verifiedAt: input.verifiedAt ?? null,
    paidAt: input.paidAt ?? input.verifiedAt ?? null,
    recordedById: input.recordedById ?? null,
  });

  if (renewalTotal > 0) {
    await upsertPaymentLedgerRecord(tx, {
      applicationId: input.applicationId,
      purpose: 'ANNUAL_RENEWAL',
      billingYear: input.billingYear,
      paymentIntentId: input.paymentIntentId ?? null,
      collectionMode: input.collectionMode,
      paymentMethod: input.paymentMethod,
      transactionReferenceNumber: input.transactionReferenceNumber,
      providerReference: input.providerReference ?? null,
      externalReference: input.externalReference ?? null,
      checkoutRequestId: input.checkoutRequestId ?? null,
      merchantRequestId: input.merchantRequestId ?? null,
      payerPhoneNumber: input.payerPhoneNumber ?? null,
      amount: renewalTotal,
      baseAmount: renewalBaseAmount,
      taxAmount: renewalTaxAmount,
      totalAmount: renewalTotal,
      currency: input.currency,
      verificationStatus: input.verificationStatus,
      verificationSource: input.verificationSource ?? null,
      description: input.renewalDescription ?? `Annual renewal fee - ${input.billingYear}`,
      notes: input.notes ?? null,
      proofUrl: input.proofUrl ?? null,
      proofOriginalName: input.proofOriginalName ?? null,
      status: input.status,
      verifiedAt: input.verifiedAt ?? null,
      paidAt: input.paidAt ?? input.verifiedAt ?? null,
      recordedById: input.recordedById ?? null,
    });
  }
}

export async function upsertPaymentLedgerRecord(tx: Prisma.TransactionClient | PrismaClient, input: PaymentLedgerInput) {
  const existing = await tx.membershipPaymentRecord.findFirst({
    where: {
      applicationId: input.applicationId,
      transactionReferenceNumber: input.transactionReferenceNumber,
      purpose: input.purpose ?? 'APPLICATION_FEE',
      billingYear: input.billingYear ?? null,
    },
    select: { id: true },
  });

  const data: Prisma.MembershipPaymentRecordUncheckedCreateInput = {
    applicationId: input.applicationId,
    purpose: input.purpose ?? 'APPLICATION_FEE',
    billingYear: input.billingYear ?? null,
    paymentIntentId: input.paymentIntentId ?? null,
    collectionMode: input.collectionMode,
    provider: getPaymentProvider(input.collectionMode),
    paymentMethod: input.paymentMethod,
    transactionReferenceNumber: input.transactionReferenceNumber,
    providerReference: input.providerReference ?? null,
    externalReference: input.externalReference ?? null,
    checkoutRequestId: input.checkoutRequestId ?? null,
    merchantRequestId: input.merchantRequestId ?? null,
    payerPhoneNumber: input.payerPhoneNumber ?? null,
    amount: input.amount ?? null,
    baseAmount: input.baseAmount ?? null,
    taxAmount: input.taxAmount ?? null,
    totalAmount: input.totalAmount ?? input.amount ?? null,
    currency: input.currency,
    verificationStatus: input.verificationStatus,
    verificationSource: input.verificationSource ?? null,
    rawRequestPayload: input.rawRequestPayload ?? undefined,
    rawCallbackPayload: input.rawCallbackPayload ?? undefined,
    reconciliationPayload: input.reconciliationPayload ?? undefined,
    description: input.description ?? null,
    notes: input.notes ?? null,
    proofUrl: input.proofUrl ?? null,
    proofOriginalName: input.proofOriginalName ?? null,
    status: input.status,
    initiatedAt: input.initiatedAt ?? null,
    callbackReceivedAt: input.callbackReceivedAt ?? null,
    verifiedAt: input.verifiedAt ?? null,
    paidAt: input.paidAt ?? input.verifiedAt ?? null,
    recordedById: input.recordedById ?? null,
  };

  if (existing) {
    return tx.membershipPaymentRecord.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.membershipPaymentRecord.create({ data });
}

type IntentAuditInput = {
  intentId: string;
  providerReference?: string | null;
  checkoutRequestId?: string | null;
  payerPhoneNumber?: string | null;
  verificationStatus: PaymentVerificationStatus;
  verificationSource?: PaymentVerificationSource | null;
  callbackPayload?: Prisma.InputJsonValue | null;
  reconciliationPayload?: Prisma.InputJsonValue | null;
  paymentInitiatedAt?: Date | null;
  callbackReceivedAt?: Date | null;
  lastVerifiedAt?: Date | null;
  verifiedAt?: Date | null;
  lockedAt?: Date | null;
  status: 'CREATED' | 'AWAITING_PAYMENT' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'LOCKED';
  mpesaReceiptNumber?: string | null;
  lastError?: string | null;
};

export async function updatePaymentIntentAudit(tx: Prisma.TransactionClient | PrismaClient, input: IntentAuditInput) {
  return tx.paymentIntent.update({
    where: { id: input.intentId },
    data: {
      provider: 'MPESA_DARAJA',
      providerReference: input.providerReference ?? null,
      checkoutRequestId: input.checkoutRequestId ?? null,
      payerPhoneNumber: input.payerPhoneNumber ?? null,
      verificationStatus: input.verificationStatus,
      verificationSource: input.verificationSource ?? null,
      callbackPayload: input.callbackPayload ?? undefined,
      reconciliationPayload: input.reconciliationPayload ?? undefined,
      paymentInitiatedAt: input.paymentInitiatedAt ?? undefined,
      callbackReceivedAt: input.callbackReceivedAt ?? undefined,
      lastVerifiedAt: input.lastVerifiedAt ?? undefined,
      verifiedAt: input.verifiedAt ?? undefined,
      lockedAt: input.lockedAt ?? undefined,
      status: input.status,
      mpesaReceiptNumber: input.mpesaReceiptNumber ?? undefined,
      lastError: input.lastError ?? null,
    },
  });
}

type IncidentInput = {
  type: string;
  severity?: PaymentIncidentSeverity;
  title: string;
  detail?: string | null;
  userId?: string | null;
  applicationId?: string | null;
  paymentIntentId?: string | null;
  mpesaRequestId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function openPaymentIncident(tx: Prisma.TransactionClient | PrismaClient, input: IncidentInput) {
  const existing = await tx.paymentIncident.findFirst({
    where: {
      type: input.type,
      status: 'OPEN',
      userId: input.userId ?? null,
      applicationId: input.applicationId ?? null,
      paymentIntentId: input.paymentIntentId ?? null,
      mpesaRequestId: input.mpesaRequestId ?? null,
    },
    select: { id: true },
  });

  if (existing) {
    return tx.paymentIncident.update({
      where: { id: existing.id },
      data: {
        severity: input.severity ?? 'WARNING',
        title: input.title,
        detail: input.detail ?? null,
        metadata: input.metadata ?? undefined,
        detectedAt: new Date(),
      },
    });
  }

  return tx.paymentIncident.create({
    data: {
      type: input.type,
      severity: input.severity ?? 'WARNING',
      title: input.title,
      detail: input.detail ?? null,
      userId: input.userId ?? null,
      applicationId: input.applicationId ?? null,
      paymentIntentId: input.paymentIntentId ?? null,
      mpesaRequestId: input.mpesaRequestId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function resolvePaymentIncidents(
  tx: Prisma.TransactionClient | PrismaClient,
  where: Prisma.PaymentIncidentWhereInput,
  resolutionNote: string,
) {
  return tx.paymentIncident.updateMany({
    where: {
      ...where,
      status: 'OPEN',
    },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolutionNote,
    },
  });
}
