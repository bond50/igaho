import { NextResponse } from 'next/server';

import { parseMpesaTransactionDate } from '@/features/payments/lib/daraja';
import { assertTrustedDarajaRequest } from '@/features/payments/lib/guards';
import { openPaymentIncident, resolvePaymentIncidents, upsertPaymentLedgerRecord } from '@/features/payments/lib/ledger';
import { Prisma } from '@/prisma/src/generated/prisma/client';
import { db } from '@/lib/db';

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    assertTrustedDarajaRequest(request);
  } catch (error) {
    await openPaymentIncident(db, {
      type: 'UNTRUSTED_C2B_CONFIRMATION',
      severity: 'CRITICAL',
      title: 'Rejected C2B confirmation from untrusted source',
      detail: error instanceof Error ? error.message : 'Rejected C2B confirmation from untrusted source.',
    });
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Untrusted confirmation source.' });
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const setting = await db.applicationPortalSetting.findUnique({
    where: { singletonKey: 'default' },
    select: { isC2BEnabled: true, c2bShortCode: true },
  });

  if (!setting?.isC2BEnabled) {
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'C2B confirmation is not enabled.' });
  }

  const transId = readString(payload?.TransID);
  const msisdn = readString(payload?.MSISDN);
  const amount = Math.round(Number(payload?.TransAmount ?? 0));
  const shortCode = readString(payload?.BusinessShortCode);
  const billRefNumber = readString(payload?.BillRefNumber) || null;
  const transactionTime = parseMpesaTransactionDate(readString(payload?.TransTime));

  if (!transId || !msisdn || !Number.isFinite(amount) || amount <= 0) {
    await openPaymentIncident(db, {
      type: 'INVALID_C2B_CONFIRMATION',
      severity: 'CRITICAL',
      title: 'Incomplete C2B confirmation payload',
      detail: 'A required C2B confirmation field was missing or invalid.',
      metadata: payload as Prisma.InputJsonValue,
    });
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Incomplete C2B confirmation payload.' });
  }

  if (setting.c2bShortCode && shortCode && setting.c2bShortCode !== shortCode) {
    await openPaymentIncident(db, {
      type: 'C2B_SHORTCODE_MISMATCH',
      severity: 'CRITICAL',
      title: 'C2B confirmation short code mismatch',
      detail: `Expected ${setting.c2bShortCode} but received ${shortCode}.`,
      metadata: payload as Prisma.InputJsonValue,
    });
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Short code mismatch for this C2B confirmation endpoint.' });
  }

  const matchedApplication = await db.membershipApplication.findFirst({
    where: {
      OR: [
        { transactionReferenceNumber: transId },
        billRefNumber ? { transactionReferenceNumber: billRefNumber } : undefined,
      ].filter(Boolean) as { transactionReferenceNumber: string }[],
    },
    select: {
      id: true,
      userId: true,
      paymentCollectionMode: true,
      paymentMethod: true,
      currency: true,
      paymentTotalAmount: true,
      paymentBaseAmount: true,
      paymentTaxAmount: true,
    },
  });

  const receipt = await db.mpesaC2BReceipt.upsert({
    where: { transId },
    update: {
      applicationId: matchedApplication?.id ?? null,
      userId: matchedApplication?.userId ?? null,
      shortCode: shortCode || null,
      billRefNumber,
      invoiceNumber: readString(payload?.InvoiceNumber) || null,
      orgAccountBalance: readString(payload?.OrgAccountBalance) || null,
      thirdPartyTransId: readString(payload?.ThirdPartyTransID) || null,
      msisdn,
      firstName: readString(payload?.FirstName) || null,
      middleName: readString(payload?.MiddleName) || null,
      lastName: readString(payload?.LastName) || null,
      transAmount: amount,
      transactionType: readString(payload?.TransactionType) || null,
      transTime: transactionTime,
      isValidated: true,
      validationResultCode: '0',
      validationResultDesc: 'Accepted',
      rawPayload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    create: {
      applicationId: matchedApplication?.id ?? null,
      userId: matchedApplication?.userId ?? null,
      shortCode: shortCode || null,
      billRefNumber,
      invoiceNumber: readString(payload?.InvoiceNumber) || null,
      orgAccountBalance: readString(payload?.OrgAccountBalance) || null,
      thirdPartyTransId: readString(payload?.ThirdPartyTransID) || null,
      msisdn,
      firstName: readString(payload?.FirstName) || null,
      middleName: readString(payload?.MiddleName) || null,
      lastName: readString(payload?.LastName) || null,
      transId,
      transAmount: amount,
      transactionType: readString(payload?.TransactionType) || null,
      transTime: transactionTime,
      isValidated: true,
      validationResultCode: '0',
      validationResultDesc: 'Accepted',
      rawPayload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  if (matchedApplication) {
    await upsertPaymentLedgerRecord(db, {
      applicationId: matchedApplication.id,
      collectionMode: 'MPESA_DARAJA',
      paymentMethod: 'MPESA',
      transactionReferenceNumber: transId,
      providerReference: transId,
      externalReference: receipt.billRefNumber,
      payerPhoneNumber: msisdn,
      amount,
      baseAmount: matchedApplication.paymentBaseAmount ?? amount,
      taxAmount: matchedApplication.paymentTaxAmount ?? Math.max(amount - (matchedApplication.paymentBaseAmount ?? amount), 0),
      totalAmount: amount,
      currency: matchedApplication.currency,
      verificationStatus: 'VERIFIED',
      verificationSource: 'C2B_CONFIRMATION',
      rawCallbackPayload: payload as Prisma.InputJsonValue,
      description: 'Verified through Daraja C2B confirmation',
      notes: `Daraja C2B confirmation received for ${transId}.`,
      status: 'VERIFIED',
      callbackReceivedAt: new Date(),
      verifiedAt: transactionTime ?? new Date(),
      paidAt: transactionTime ?? new Date(),
    });

    await resolvePaymentIncidents(db, { applicationId: matchedApplication.id }, 'Resolved after matched Daraja C2B confirmation.');
  } else {
    await openPaymentIncident(db, {
      type: 'UNMATCHED_C2B_CONFIRMATION',
      severity: 'WARNING',
      title: 'C2B confirmation did not match any application',
      detail: `Received ${transId} for bill reference ${billRefNumber ?? 'not provided'}.`,
      userId: receipt.userId,
      metadata: payload as Prisma.InputJsonValue,
    });
  }

  return NextResponse.json({ ResultCode: '0', ResultDesc: 'Accepted' });
}
