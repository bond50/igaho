import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Clock3, ExternalLink, LockKeyhole, ReceiptText, RefreshCw, ShieldCheck, Siren, XCircle } from 'lucide-react';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getApplicationByUserId, getHeaderNotifications } from '@/features/application/queries/application';
import { getPortalBranding } from '@/features/application/queries/settings';
import { getMemberPortalContext } from '@/features/application/queries/member-portal';
import { grantRenewalAccessNow, manuallyVerifyPaymentRequestNow, markPaymentRequestForManualFollowUp, reconcilePaymentRequestNow, resendPaymentRequestNow, resolvePaymentIncidentNow, runPaymentReconciliationNow } from '@/features/payments/actions/operations';
import { getAdminPaymentExceptions, getPendingRenewalAccessApprovals } from '@/features/payments/queries/daraja';

type MemberApplication = NonNullable<Awaited<ReturnType<typeof getApplicationByUserId>>>;

function formatDateTime(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}


function InlineHelp({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1 inline-flex align-middle text-slate-400 hover:text-slate-600">
      <CircleHelp className="h-3.5 w-3.5" />
    </span>
  );
}
function PaymentStatusBadge({ status }: { status: 'VERIFIED' | 'PENDING' | 'REJECTED' }) {
  const styles =
    status === 'VERIFIED'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'REJECTED'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${styles}`}>{status}</span>;
}

function formatPaymentPurpose(purpose: 'APPLICATION_FEE' | 'ANNUAL_RENEWAL', billingYear?: number | null) {
  return purpose === 'ANNUAL_RENEWAL'
    ? `Annual renewal${billingYear ? ` · ${billingYear}` : ''}`
    : 'Application fee';
}

function IntentStatusBadge({ status }: { status: 'CREATED' | 'AWAITING_PAYMENT' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'LOCKED' }) {
  const styles =
    status === 'LOCKED'
      ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]'
      : status === 'VERIFIED'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : status === 'CREATED' || status === 'AWAITING_PAYMENT'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-rose-200 bg-rose-50 text-rose-700';

  const labelMap: Record<string, string> = {
    CREATED: 'Created',
    AWAITING_PAYMENT: 'Awaiting payment',
    VERIFIED: 'Verified',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
    LOCKED: 'Locked',
  };

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${styles}`}>{labelMap[status]}</span>;
}

function renderMemberLedger(application: MemberApplication, title = 'Your payments') {
  const verifiedRecords = application.paymentRecords.filter((record) => record.status === 'VERIFIED');
  const latestRecord = application.paymentRecords[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total records</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{application.paymentRecords.length}</p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-medium text-emerald-700">Verified payments</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{verifiedRecords.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-5">
          <p className="text-sm font-medium text-[var(--brand)]">Latest recorded payment</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{latestRecord ? formatDateTime(latestRecord.paidAt ?? latestRecord.createdAt) : 'Not recorded'}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
            <p className="text-sm text-slate-600">These entries show your application and renewal payments.</p>
          </div>
          {application.paymentProofUrl ? (
            <Link href={application.paymentProofUrl} target="_blank" className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View uploaded receipt
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          ) : null}
        </div>

        {application.paymentRecords.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            No payments have been recorded for this membership yet.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {application.paymentRecords.map((record) => (
              <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <PaymentStatusBadge status={record.status} />
                      <p className="text-sm font-medium text-slate-900">{formatPaymentPurpose(record.purpose, record.billingYear)} · {record.paymentMethod.replaceAll('_', ' ')} · {record.transactionReferenceNumber}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p><span className="font-medium text-slate-900">Collection mode:</span> {record.collectionMode === 'MPESA_DARAJA' ? 'Automatic paybill payment' : 'Receipt upload'}</p>
                      <p><span className="font-medium text-slate-900">Amount:</span> {record.currency} {(record.totalAmount ?? record.amount ?? 0).toLocaleString()}</p>
                      <p><span className="font-medium text-slate-900">Phone number:</span> {record.payerPhoneNumber ?? 'Not recorded'}</p>
                      <p><span className="font-medium text-slate-900">Paid at:</span> {formatDateTime(record.paidAt ?? record.createdAt)}</p>
                      <p><span className="font-medium text-slate-900">Recorded by:</span> {record.recordedBy?.name ?? record.recordedBy?.email ?? 'System'}</p>
                      <p><span className="font-medium text-slate-900">Charge type:</span> {formatPaymentPurpose(record.purpose, record.billingYear)}</p>
                      <p><span className="font-medium text-slate-900">Description:</span> {record.description ?? 'Membership payment record'}</p>
                      <p className="sm:col-span-2"><span className="font-medium text-slate-900">Notes:</span> {record.notes ?? 'No notes recorded'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {record.proofUrl ? (
                      <Link href={record.proofUrl} target="_blank" className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        View proof
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function PaymentsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login?callbackUrl=%2Fdashboard%2Fpayments');
  }

  const isAdmin = session.user.role === 'ADMIN';

  if (isAdmin) {
    const [exceptions, application, notifications, renewalApprovals, branding] = await Promise.all([
      getAdminPaymentExceptions(),
      getApplicationByUserId(session.user.id),
      getHeaderNotifications(true, session.user.id),
      getPendingRenewalAccessApprovals(),
      getPortalBranding(),
    ]);

    const memberApplication = application?.status === 'ACTIVE' ? application : null;
    const totalExceptions = exceptions.counts.awaitingCallback + exceptions.counts.callbackMissingButPossiblyPaid + exceptions.counts.failedOrClosedIntents + exceptions.counts.verifiedUnlockedIntents + exceptions.counts.unmatchedC2BReceipts + exceptions.counts.openIncidents;
    const exceptionCards = [
      {
        key: 'awaiting-callback',
        title: 'Awaiting update too long',
        count: exceptions.counts.awaitingCallback,
        description: 'Payment prompts that have stayed pending longer than expected and should be rechecked or resent.',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        help: 'Payment prompts that have stayed pending longer than expected and still need an update.',
      },
      {
        key: 'callback-missing',
        title: 'Looks paid, but update missing',
        count: exceptions.counts.callbackMissingButPossiblyPaid,
        description: 'Payments that look successful, but the system did not receive the expected update.',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
        help: 'The payment may have succeeded, but the expected system update did not arrive or was incomplete.',
      },
      {
        key: 'failed-intents',
        title: 'Failed, cancelled, or expired payments',
        count: exceptions.counts.failedOrClosedIntents,
        description: 'Payment attempts that did not finish successfully and may need a resend or manual follow-up.',
        className: 'border-rose-200 bg-rose-50 text-rose-700',
        help: 'Payment attempts that did not complete successfully and usually need retry or follow-up.',
      },
      {
        key: 'verified-unlocked',
        title: 'Paid but not attached',
        count: exceptions.counts.verifiedUnlockedIntents,
        description: 'Payment is confirmed, but it is not yet attached to the application.',
        className: 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]',
        help: 'Payment is confirmed, but it has not yet attached to a submitted application.',
      },
      {
        key: 'unmatched-c2b',
        title: 'Unmatched paybill confirmations',
        count: exceptions.counts.unmatchedC2BReceipts,
        description: 'Paybill confirmations that came in, but the system could not match them to an application.',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
        help: 'Paybill confirmations that could not be matched automatically to any application.',
      },
      {
        key: 'open-incidents',
        title: 'Open follow-up items',
        count: exceptions.counts.openIncidents,
        description: 'System or admin follow-up items that still need attention.',
        className: 'border-violet-200 bg-violet-50 text-violet-700',
        help: 'System or admin follow-up items for payment review.',
      },
    ].filter((card) => card.count > 0);

    return (
      <AppShell
        currentPath="/dashboard/payments"
        isAdmin
        notifications={notifications}
        organizationName={branding.organizationName}
        organizationShortName={branding.organizationShortName}
        heading="Payment operations"
      footerMode="hidden"
        description="Review payment issues that need follow-up."
        pageActions={
          <>
            <Link href="/dashboard/export/payments" className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Export payment issues
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
            <form action={runPaymentReconciliationNow}>
              <Button type="submit" className="rounded-xl" title="Checks delayed or unresolved payment updates again.">
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-check pending payments
              </Button>
            </form>
          </>
        }
      >
        {totalExceptions > 0 ? (
          <>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-900">Payment issues overview</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Only issues that need attention are shown below.</p>
              
            </div>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {exceptionCards.map((card) => (
                <div key={card.key} className={`rounded-2xl border p-5 ${card.className}`}>
                  <p className="text-sm font-medium">
                    {card.title}
                    <InlineHelp text={card.help} />
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{card.count}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{card.description}</p>
                </div>
              ))}
            </section>
          </>
        ) : null}

        {renewalApprovals.length > 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Renewal approvals</h2>
                <p className="mt-1 text-sm text-slate-600">These renewal payments were received and now need admin approval before access is restored.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {renewalApprovals.map((intent) => {
                const memberName = intent.membershipApplication
                  ? `${intent.membershipApplication.firstName} ${intent.membershipApplication.surname}`.trim()
                  : 'Active member';
                const latestRequest = intent.requests[0] ?? null;

                return (
                  <div key={intent.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center gap-3">
                      <IntentStatusBadge status={intent.status} />
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-emerald-700">
                        Annual renewal{intent.billingYear ? ` · ${intent.billingYear}` : ''}
                      </span>
                      <p className="font-medium text-slate-900">{memberName}</p>
                      <p>{intent.currency} {intent.totalAmount.toLocaleString()}</p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <p><span className="font-medium text-slate-900">Membership number:</span> {intent.membershipApplication?.membershipNumber ?? 'Not assigned'}</p>
                      <p><span className="font-medium text-slate-900">County:</span> {intent.membershipApplication?.county ?? 'Not recorded'}</p>
                      <p><span className="font-medium text-slate-900">Verified at:</span> {formatDateTime(intent.verifiedAt)}</p>
                      <p><span className="font-medium text-slate-900">Receipt:</span> {intent.mpesaReceiptNumber ?? latestRequest?.mpesaReceiptNumber ?? 'Waiting for receipt'}</p>
                      <p><span className="font-medium text-slate-900">Phone:</span> {intent.payerPhoneNumber ?? latestRequest?.phoneNumber ?? 'Not recorded'}</p>
                      <p><span className="font-medium text-slate-900">Reference:</span> {intent.accountReference}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={grantRenewalAccessNow.bind(null, intent.id)}>
                        <Button type="submit" size="sm">Grant renewal access</Button>
                      </form>
                      {intent.membershipApplication ? (
                        <Link href={`/dashboard/applications/${intent.membershipApplication.id}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                          Open member record
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {totalExceptions === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
            <p className="font-medium text-slate-900">No payment issues are open.</p>
            <p className="mt-2 max-w-3xl leading-6">There is nothing here that currently needs payment follow-up. New issues will appear here automatically.</p>
          </section>
        ) : (
          <div className="space-y-8">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Awaiting update too long</h2>
                  
                </div>
              </div>

              {exceptions.awaitingCallback.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No delayed payment updates right now.</div>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.awaitingCallback.map((request) => {
                    const applicantName = request.application ? `${request.application.firstName} ${request.application.surname}`.trim() : request.user?.name ?? request.user?.email ?? 'Unknown applicant';
                    return (
                      <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-amber-700">{request.status.replaceAll('_', ' ')}</span>
                          <p className="font-medium text-slate-900">{applicantName}</p>
                          <p>{request.currency} {request.amount.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          <p><span className="font-medium text-slate-900">Payer phone:</span> {request.phoneNumber}</p>
                          <p><span className="font-medium text-slate-900">Created:</span> {formatDateTime(request.createdAt)}</p>
                          <p><span className="font-medium text-slate-900">Payment state:</span> {request.paymentIntent?.status?.replaceAll('_', ' ') ?? 'Not linked'}</p>
                        </div>
                        <Collapsible className="mt-3 rounded-xl border border-slate-200 bg-white">
                          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700">
                            More details
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-900">Payment prompt ID:</span> {request.checkoutRequestId ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Next check:</span> {formatDateTime(request.nextReconciliationAt)}</p>
                            <p><span className="font-medium text-slate-900">Attempts:</span> {request.reconciliationAttemptCount}</p>
                            <p><span className="font-medium text-slate-900">Latest source:</span> {request.lastReconciliationSource?.replaceAll('_', ' ') ?? 'Not recorded'}</p>
                            {request.lastReconciliationNote ? <p><span className="font-medium text-slate-900">Latest note:</span> {request.lastReconciliationNote}</p> : null}
                          </CollapsibleContent>
                        </Collapsible>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <form action={reconcilePaymentRequestNow.bind(null, request.id)}>
                            <Button type="submit" variant="outline" size="sm" title="Re-check this payment and refresh its status.">Re-check this request</Button>
                          </form>
                          <form action={markPaymentRequestForManualFollowUp.bind(null, request.id, 'Delayed callback requires manual follow-up')}>
                            <Button type="submit" variant="outline" size="sm">Mark for manual follow-up</Button>
                          </form>
                          <form action={resendPaymentRequestNow.bind(null, request.id)}>
                            <Button type="submit" variant="outline" size="sm">Resend payment prompt</Button>
                          </form>
                          {request.application ? (
                            <Link href={`/dashboard/applications/${request.application.id}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                              Open application
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Looks paid, but update missing</h2>
                  
                </div>
              </div>

              {exceptions.callbackMissingButPossiblyPaid.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No missing-update paid cases right now.</div>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.callbackMissingButPossiblyPaid.map((request) => {
                    const applicantName = request.application ? `${request.application.firstName} ${request.application.surname}`.trim() : request.user?.name ?? request.user?.email ?? 'Unknown applicant';
                    return (
                      <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-sky-700">{request.status.replaceAll('_', ' ')}</span>
                          <p className="font-medium text-slate-900">{applicantName}</p>
                          <p>{request.currency} {request.amount.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          <p><span className="font-medium text-slate-900">Receipt:</span> {request.mpesaReceiptNumber ?? 'Not recorded'}</p>
                          <p><span className="font-medium text-slate-900">Payer phone:</span> {request.phoneNumber}</p>
                          <p><span className="font-medium text-slate-900">Payment state:</span> {request.paymentIntent?.status?.replaceAll('_', ' ') ?? 'Not linked'}</p>
                        </div>
                        <Collapsible className="mt-3 rounded-xl border border-slate-200 bg-white">
                          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700">
                            More details
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-900">Payment prompt ID:</span> {request.checkoutRequestId ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Latest source:</span> {request.lastReconciliationSource?.replaceAll('_', ' ') ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Last checked:</span> {formatDateTime(request.lastReconciledAt)}</p>
                          </CollapsibleContent>
                        </Collapsible>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <form action={manuallyVerifyPaymentRequestNow.bind(null, request.id)}>
                            <Button type="submit" variant="outline" size="sm">Confirm successful payment</Button>
                          </form>
                          {request.application ? (
                            <Link href={`/dashboard/applications/${request.application.id}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                              Open application
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Failed, cancelled, or expired payments</h2>
                  
                </div>
              </div>

              {exceptions.failedOrClosedIntents.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No failed, cancelled, or expired payments right now.</div>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.failedOrClosedIntents.map((intent) => {
                    const applicantName = intent.application ? `${intent.application.firstName} ${intent.application.surname}`.trim() : intent.user?.name ?? intent.user?.email ?? 'Unknown applicant';
                    const latestRequest = intent.requests[0] ?? null;
                    return (
                      <div key={intent.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                          <IntentStatusBadge status={intent.status} />
                          <p className="font-medium text-slate-900">{applicantName}</p>
                          <p>{intent.currency} {intent.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          <p><span className="font-medium text-slate-900">Reference:</span> {intent.accountReference}</p>
                          <p><span className="font-medium text-slate-900">Payer phone:</span> {intent.payerPhoneNumber ?? 'Not recorded'}</p>
                          <p><span className="font-medium text-slate-900">Updated:</span> {formatDateTime(intent.updatedAt)}</p>
                          <p><span className="font-medium text-slate-900">Receipt:</span> {intent.mpesaReceiptNumber ?? 'Not recorded'}</p>
                        </div>
                        <p className="mt-3 text-slate-600"><span className="font-medium text-slate-900">Last issue:</span> {intent.lastError ?? latestRequest?.resultDesc ?? 'No detailed reason recorded'}</p>
                        <Collapsible className="mt-3 rounded-xl border border-slate-200 bg-white">
                          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700">
                            More details
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-900">Payment prompt ID:</span> {intent.checkoutRequestId ?? latestRequest?.checkoutRequestId ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Latest request state:</span> {latestRequest?.status?.replaceAll('_', ' ') ?? 'No request history'}</p>
                            <p><span className="font-medium text-slate-900">Latest source:</span> {intent.verificationSource?.replaceAll('_', ' ') ?? latestRequest?.lastReconciliationSource?.replaceAll('_', ' ') ?? 'Not recorded'}</p>
                          </CollapsibleContent>
                        </Collapsible>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {latestRequest ? (
                            <>
                              <form action={markPaymentRequestForManualFollowUp.bind(null, latestRequest.id, 'Failed or closed payment intent requires manual follow-up')}>
                                <Button type="submit" variant="outline" size="sm">Mark for manual follow-up</Button>
                              </form>
                              <form action={resendPaymentRequestNow.bind(null, latestRequest.id)}>
                                <Button type="submit" variant="outline" size="sm">Resend payment prompt</Button>
                              </form>
                              {(latestRequest.mpesaReceiptNumber || latestRequest.status === 'SUCCESS') ? (
                                <form action={manuallyVerifyPaymentRequestNow.bind(null, latestRequest.id)}>
                                  <Button type="submit" variant="outline" size="sm">Confirm successful payment</Button>
                                </form>
                              ) : null}
                            </>
                          ) : null}
                          {intent.application ? (
                            <Link href={`/dashboard/applications/${intent.application.id}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                              Open application
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>


            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <ReceiptText className="mt-0.5 h-5 w-5 text-sky-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Unmatched paybill confirmations</h2>
                  
                </div>
              </div>

              {exceptions.unmatchedC2BReceipts.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No unmatched paybill confirmations right now.</div>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.unmatchedC2BReceipts.map((receipt) => {
                    const payerName = [receipt.firstName, receipt.middleName, receipt.lastName].filter(Boolean).join(' ');
                    return (
                      <div key={receipt.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-sky-700">Paybill confirmation</span>
                          <p className="font-medium text-slate-900">{payerName || receipt.user?.name || receipt.user?.email || 'Unmatched payer'}</p>
                          <p>KES {receipt.transAmount.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          <p><span className="font-medium text-slate-900">Transaction ID:</span> {receipt.transId}</p>
                          <p><span className="font-medium text-slate-900">Bill reference:</span> {receipt.billRefNumber ?? 'Not provided'}</p>
                          <p><span className="font-medium text-slate-900">Phone:</span> {receipt.msisdn}</p>
                          <p><span className="font-medium text-slate-900">Confirmed at:</span> {formatDateTime(receipt.transTime ?? receipt.createdAt)}</p>
                        </div>
                        <Collapsible className="mt-3 rounded-xl border border-slate-200 bg-white">
                          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700">
                            More details
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-900">Short code:</span> {receipt.shortCode ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Decision:</span> {receipt.validationResultDesc ?? receipt.validationResultCode ?? (receipt.isValidated ? 'Accepted' : 'Pending')}</p>
                          </CollapsibleContent>
                        </Collapsible>
                        <p className="mt-3 text-slate-600"><span className="font-medium text-slate-900">Next step:</span> Use the bill reference or transaction ID to locate the application and confirm whether the payer paid outside the payment prompt flow.</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <Siren className="mt-0.5 h-5 w-5 text-violet-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Open follow-up items</h2>
                  
                </div>
              </div>

              {exceptions.openIncidents.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No open follow-up items right now.</div>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.openIncidents.map((incident) => (
                    <div key={incident.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-violet-700">{incident.severity}</span>
                        <p className="font-medium text-slate-900">{incident.title}</p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <p><span className="font-medium text-slate-900">Type:</span> {incident.type.replaceAll('_', ' ')}</p>
                        <p><span className="font-medium text-slate-900">Detected:</span> {formatDateTime(incident.detectedAt)}</p>
                        <p><span className="font-medium text-slate-900">Applicant:</span> {incident.application ? `${incident.application.firstName} ${incident.application.surname}`.trim() : incident.user?.name ?? incident.user?.email ?? 'Not linked'}</p>
                        <p><span className="font-medium text-slate-900">Amount:</span> {incident.paymentIntent ? `${incident.paymentIntent.currency} ${incident.paymentIntent.totalAmount.toLocaleString()}` : 'Not recorded'}</p>
                      </div>
                      <Collapsible className="mt-3 rounded-xl border border-slate-200 bg-white">
                        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700">
                          More details
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
                          <p><span className="font-medium text-slate-900">Request:</span> {incident.mpesaRequest?.checkoutRequestId ?? incident.mpesaRequest?.id ?? 'Not linked'}</p>
                          <p><span className="font-medium text-slate-900">Reference:</span> {incident.paymentIntent?.accountReference ?? incident.paymentIntent?.id ?? 'Not linked'}</p>
                        </CollapsibleContent>
                      </Collapsible>
                      {incident.detail ? <p className="mt-3 text-slate-600"><span className="font-medium text-slate-900">Detail:</span> {incident.detail}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <form action={resolvePaymentIncidentNow.bind(null, incident.id)}>
                          <Button type="submit" variant="outline" size="sm">Resolve item</Button>
                        </form>
                        {incident.application ? (
                          <Link href={`/dashboard/applications/${incident.application.id}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                            Open application
                            <ExternalLink className="ml-2 h-4 w-4" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 text-[var(--brand)]" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Paid but not attached to an application <InlineHelp text="Payment is confirmed, but the system has not yet attached it to a submitted application." /></h2>
                  
                </div>
              </div>

              {exceptions.verifiedUnlockedIntents.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No paid-but-unattached cases right now.</div>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.verifiedUnlockedIntents.map((intent) => {
                    const latestRequest = intent.requests[0] ?? null;
                    return (
                      <div key={intent.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                          <IntentStatusBadge status={intent.status} />
                          <p className="font-medium text-slate-900">{intent.user?.name ?? intent.user?.email ?? 'Unknown applicant'}</p>
                          <p>{intent.currency} {intent.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          <p><span className="font-medium text-slate-900">Confirmed at:</span> {formatDateTime(intent.verifiedAt)}</p>
                          <p><span className="font-medium text-slate-900">Payer phone:</span> {intent.payerPhoneNumber ?? 'Not recorded'}</p>
                          <p><span className="font-medium text-slate-900">Reference:</span> {intent.accountReference}</p>
                          <p><span className="font-medium text-slate-900">Receipt:</span> {intent.mpesaReceiptNumber ?? 'Not recorded'}</p>
                        </div>
                        <Collapsible className="mt-3 rounded-xl border border-slate-200 bg-white">
                          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700">
                            More details
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-900">Payment prompt ID:</span> {intent.checkoutRequestId ?? latestRequest?.checkoutRequestId ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Last update:</span> {formatDateTime(latestRequest?.updatedAt)}</p>
                          </CollapsibleContent>
                        </Collapsible>
                        <p className="mt-3 text-slate-600">This usually means the applicant paid successfully but has not finished the application yet.</p>
                        {latestRequest ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <form action={markPaymentRequestForManualFollowUp.bind(null, latestRequest.id, 'Verified payment not yet locked to application')}>
                              <button type="submit" className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                                Mark for manual follow-up
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {memberApplication ? (
          <div className="border-t border-slate-200 pt-8">
            {renderMemberLedger(memberApplication, 'Your member payment ledger')}
          </div>
        ) : null}
      </AppShell>
    );
  }

  const [application, notifications, branding] = await Promise.all([
    getApplicationByUserId(session.user.id),
    getHeaderNotifications(false, session.user.id),
    getPortalBranding(),
  ]);

  if (!application || application.status !== 'ACTIVE') {
    redirect('/dashboard');
  }

  return (
    <AppShell
      currentPath="/dashboard/payments"
      notifications={notifications}
      organizationName={branding.organizationName}
      organizationShortName={branding.organizationShortName}
      heading="Payments"
      footerMode="hidden"
      description="Review your recorded application and renewal payments."
    >
      {renderMemberLedger(application)}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center gap-3 text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="font-semibold">Confirmed payments</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">Confirmed payments are part of your official membership payment history.</p>
        </div>
        <div className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center gap-3 text-slate-900">
            <Clock3 className="h-5 w-5 text-amber-600" />
            <p className="font-semibold">Pending review</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">Pending entries stay here until an administrator confirms them.</p>
        </div>
        <div className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center gap-3 text-slate-900">
            <XCircle className="h-5 w-5 text-rose-600" />
            <p className="font-semibold">Rejected entries</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">Rejected entries remain in history for record keeping.</p>
        </div>
      </section>
    </AppShell>
  );
}









