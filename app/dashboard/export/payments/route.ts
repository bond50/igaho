import { auth } from '@/auth';
import { getAdminPaymentExceptions } from '@/features/payments/queries/daraja';

function escapeCsv(value: string | number | null | undefined) {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    return new Response('Unauthorized', { status: 401 });
  }

  const exceptions = await getAdminPaymentExceptions();
  const sections: string[] = [];

  sections.push([
    'Bucket,Count',
    `Awaiting callback too long,${escapeCsv(exceptions.counts.awaitingCallback)}`,
    `Callback missing but possibly paid,${escapeCsv(exceptions.counts.callbackMissingButPossiblyPaid)}`,
    `Failed cancelled or expired intents,${escapeCsv(exceptions.counts.failedOrClosedIntents)}`,
    `Verified but not locked,${escapeCsv(exceptions.counts.verifiedUnlockedIntents)}`,
    `Unmatched C2B confirmations,${escapeCsv(exceptions.counts.unmatchedC2BReceipts)}`,
    `Open incidents,${escapeCsv(exceptions.counts.openIncidents)}`,
  ].join('\n'));

  sections.push([
    'Awaiting Callback,Applicant,Phone,CheckoutRequestID,Status,Verification Source,Attempts,Next Reconciliation',
    ...exceptions.awaitingCallback.map((row) => [
      row.id,
      row.application ? `${row.application.firstName} ${row.application.surname}`.trim() : row.user?.name ?? row.user?.email ?? 'Unknown applicant',
      row.phoneNumber,
      row.checkoutRequestId,
      row.status,
      row.lastReconciliationSource,
      row.reconciliationAttemptCount,
      row.nextReconciliationAt?.toISOString(),
    ].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Callback Missing But Possibly Paid,Applicant,Phone,CheckoutRequestID,Receipt,Status,Verification Source',
    ...exceptions.callbackMissingButPossiblyPaid.map((row) => [
      row.id,
      row.application ? `${row.application.firstName} ${row.application.surname}`.trim() : row.user?.name ?? row.user?.email ?? 'Unknown applicant',
      row.phoneNumber,
      row.checkoutRequestId,
      row.mpesaReceiptNumber,
      row.status,
      row.lastReconciliationSource,
    ].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Failed Or Closed Intent,Applicant,Intent Status,Amount,Currency,Account Reference,Receipt,CheckoutRequestID,Last Error',
    ...exceptions.failedOrClosedIntents.map((row) => [
      row.id,
      row.application ? `${row.application.firstName} ${row.application.surname}`.trim() : row.user?.name ?? row.user?.email ?? 'Unknown applicant',
      row.status,
      row.totalAmount,
      row.currency,
      row.accountReference,
      row.mpesaReceiptNumber,
      row.checkoutRequestId,
      row.lastError,
    ].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Verified But Not Locked,Applicant,Amount,Currency,Account Reference,Receipt,CheckoutRequestID,Verified At',
    ...exceptions.verifiedUnlockedIntents.map((row) => [
      row.id,
      row.user?.name ?? row.user?.email ?? 'Unknown applicant',
      row.totalAmount,
      row.currency,
      row.accountReference,
      row.mpesaReceiptNumber,
      row.checkoutRequestId,
      row.verifiedAt?.toISOString(),
    ].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Unmatched C2B,Transaction ID,Bill Reference,MSISDN,Amount,Short Code,Confirmed At',
    ...exceptions.unmatchedC2BReceipts.map((row) => [
      row.id,
      row.transId,
      row.billRefNumber,
      row.msisdn,
      row.transAmount,
      row.shortCode,
      row.transTime?.toISOString() ?? row.createdAt.toISOString(),
    ].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Open Incident,Type,Severity,Title,Status,Detected At,Application,Request,Intent',
    ...exceptions.openIncidents.map((row) => [
      row.id,
      row.type,
      row.severity,
      row.title,
      row.status,
      row.detectedAt.toISOString(),
      row.application ? `${row.application.firstName} ${row.application.surname}`.trim() : '',
      row.mpesaRequest?.checkoutRequestId ?? row.mpesaRequest?.id,
      row.paymentIntent?.accountReference ?? row.paymentIntent?.id,
    ].map(escapeCsv).join(',')),
  ].join('\n'));

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');

  return new Response(sections.join('\n\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payment-exceptions-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
