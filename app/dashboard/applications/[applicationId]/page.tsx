import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, ChevronDown, ExternalLink, FileWarning, ShieldAlert, UserRoundPen } from 'lucide-react';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { approveApplication, recordMemberPayment, rejectApplication } from '@/features/application/actions/application';
import { ManualPaymentRecordForm } from '@/features/application/components/manual-payment-record-form';
import { getApplicationReviewFieldLabel, applicationReviewFieldOptions } from '@/features/application/lib/review-fields';
import { applicationReviewSections, getApplicationReviewSectionLabel } from '@/features/application/lib/review-sections';
import { getApplicationById } from '@/features/application/queries/application';

function StatusBadge({ status }: { status: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'REJECTED' }) {
  const styles =
    status === 'ACTIVE'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'REJECTED'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : status === 'DRAFT'
          ? 'border-slate-200 bg-slate-50 text-slate-700'
          : 'border-amber-200 bg-amber-50 text-amber-700';

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${styles}`}>{status}</span>;
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

function PaymentIntentBadge({ status }: { status: 'CREATED' | 'AWAITING_PAYMENT' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'LOCKED' }) {
  const styles =
    status === 'LOCKED'
      ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]'
      : status === 'VERIFIED'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : status === 'AWAITING_PAYMENT' || status === 'CREATED'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-rose-200 bg-rose-50 text-rose-700';

  const labelMap: Record<string, string> = {
    CREATED: 'Created',
    AWAITING_PAYMENT: 'Awaiting payment',
    VERIFIED: 'Verified',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
    LOCKED: 'Locked to application',
  };

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${styles}`}>{labelMap[status]}</span>;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return 'Not recorded';

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value}</p>
    </div>
  );
}

function DetailList({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
          <p className="mt-1 text-sm text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export default async function AdminApplicationReviewPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { applicationId } = await params;
  const application = await getApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  const approveAction = approveApplication.bind(null, application.id);
  const rejectAction = rejectApplication.bind(null, application.id);
  const recordPaymentAction = recordMemberPayment.bind(null, application.id);

  const profileSnapshotItems = [
    { label: 'Full name', value: [application.salutation, application.firstName, application.surname].filter(Boolean).join(' ') || 'Not provided' },
    { label: 'Gender', value: application.gender || 'Not provided' },
    { label: 'Age bracket', value: application.ageBracket || 'Not provided' },
    { label: 'ID number', value: application.idNumber || 'Not provided' },
    { label: 'Email', value: application.email || 'Not provided' },
    { label: 'Phone', value: application.phoneNumber || 'Not provided' },
    { label: 'Alternative phone', value: application.alternativePhoneNumber || 'Not provided' },
    { label: 'County', value: application.county || 'Not provided' },
    { label: 'Sub-county', value: application.subCounty || 'Not provided' },
    { label: 'Ward', value: application.ward || 'Not provided' },
    { label: 'Residence', value: application.residenceAddress || 'Not provided' },
    { label: 'Profession', value: application.profession || 'Not provided' },
    { label: 'Job title', value: application.currentJobTitle || 'Not provided' },
    { label: 'Employer', value: application.employerOrOrganizationName || 'Not provided' },
    { label: 'Work location', value: application.workAddressOrLocation || 'Not provided' },
    { label: 'Education', value: application.highestLevelOfEducation || 'Not provided' },
    { label: 'Institution', value: application.institutionForHighestDegree || 'Not provided' },
    { label: 'Graduation year', value: application.yearOfGraduationForHighestDegree || 'Not provided' },
    { label: 'Licensed', value: application.isLicensed ? 'Yes' : 'No' },
    { label: 'Regulatory body', value: application.regulatoryBody || 'Not provided' },
    { label: 'Registration year', value: application.yearOfRegistration || 'Not provided' },
    { label: 'Preferred region', value: application.preferredChapterOrRegion || 'Not provided' },
    { label: 'Referee 1', value: application.refereeOneName || 'Not provided' },
    { label: 'Referee 1 phone', value: application.refereeOnePhone || 'Not provided' },
    { label: 'Referee 1 email', value: application.refereeOneEmail || 'Not provided' },
    { label: 'Referee 2', value: application.refereeTwoName || 'Not provided' },
    { label: 'Referee 2 phone', value: application.refereeTwoPhone || 'Not provided' },
    { label: 'Referee 2 email', value: application.refereeTwoEmail || 'Not provided' },
  ];

  const applicationDetailItems = [
    { label: 'Membership type', value: application.membershipType.replaceAll('_', ' ') },
    { label: 'Membership category', value: application.membershipCategory || 'Not provided' },
    { label: 'Payment mode', value: application.paymentCollectionMode === 'MPESA_DARAJA' ? 'Paybill prompt' : 'Manual payment proof' },
    { label: 'Payment method', value: application.paymentMethod.replaceAll('_', ' ') },
    { label: 'Payer number', value: application.payerPhoneNumber || 'Not provided' },
    { label: 'Transaction reference', value: application.transactionReferenceNumber || 'Waiting for confirmation' },
    { label: 'Current proof file', value: application.paymentProofOriginalName || 'Not recorded' },
    { label: 'Amount due', value: `${application.currency} ${(application.paymentTotalAmount ?? 0).toLocaleString()}` },
    { label: 'Declaration signed', value: application.digitalSignature || 'Not provided' },
    { label: 'Declaration date', value: application.declarationDate ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(application.declarationDate)) : 'Not provided' },
    { label: 'Submitted', value: formatDateTime(application.createdAt) },
    { label: 'Last updated', value: formatDateTime(application.updatedAt) },
  ];

  return (
    <AppShell
      currentPath="/dashboard"
      isAdmin
      heading="Application review"
      footerMode="hidden"
      description="Review the saved profile snapshot, submitted application details, and payment record."
      pageActions={
        <>
          <Link href="/dashboard" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Back to queue
          </Link>
        </>
      }
    >
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold text-slate-950">{application.firstName} {application.surname}</h2>
                  <StatusBadge status={application.status} />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {application.membershipCategory} / {application.county} / {application.email}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {application.paymentProofUrl ? (
                  <Link href={application.paymentProofUrl} target="_blank" className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    View payment proof
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                ) : null}
                <Link href="/profile" className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <UserRoundPen className="mr-2 h-4 w-4" />
                  Profile owner view
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoRow label="Application status" value={application.status} />
              <InfoRow label="Payment mode" value={application.paymentCollectionMode === 'MPESA_DARAJA' ? 'Paybill prompt' : 'Manual proof'} />
              <InfoRow label="Amount due" value={`${application.currency} ${(application.paymentTotalAmount ?? 0).toLocaleString()}`} />
              <InfoRow label="Membership number" value={application.membershipNumber ?? 'Not issued yet'} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
            <div className="space-y-1 border-b border-slate-200 pb-5">
              <h3 className="text-lg font-semibold text-slate-950">Applicant profile snapshot</h3>
              <p className="text-sm text-slate-600">These reusable details were captured from the applicant profile at submission time.</p>
            </div>
            <div className="mt-5">
              <DetailList items={profileSnapshotItems} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
            <div className="space-y-1 border-b border-slate-200 pb-5">
              <h3 className="text-lg font-semibold text-slate-950">Submitted application details</h3>
              <p className="text-sm text-slate-600">This section only covers the application-specific choices, declarations, and payment attachment.</p>
            </div>
            <div className="mt-5">
              <DetailList items={applicationDetailItems} />
            </div>
          </div>

          <div id="payment-intent-lifecycle" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Payment record</h3>
                <p className="mt-1 text-sm text-slate-600">Review the current payment intent first, then open the longer history only if needed.</p>
              </div>
              {application.paymentIntent ? <PaymentIntentBadge status={application.paymentIntent.status} /> : null}
            </div>

            {application.paymentIntent ? (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoRow label="Amount" value={`${application.paymentIntent.currency} ${application.paymentIntent.totalAmount.toLocaleString()}`} />
                  <InfoRow label="Payer phone" value={application.paymentIntent.payerPhoneNumber ?? 'Not recorded'} />
                  <InfoRow label="Receipt" value={application.paymentIntent.mpesaReceiptNumber ?? 'Waiting for confirmation'} />
                  <InfoRow label="Verified at" value={formatDateTime(application.paymentIntent.verifiedAt)} />
                </div>

                {application.paymentIntent.lastError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <p className="font-medium">Latest payment issue</p>
                    <p className="mt-1">{application.paymentIntent.lastError}</p>
                  </div>
                ) : null}

                <Collapsible className="mt-4 rounded-2xl border border-slate-200 bg-slate-50">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700">
                    More payment details
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-slate-200 px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <InfoRow label="Base amount" value={`${application.paymentIntent.currency} ${application.paymentIntent.baseAmount.toLocaleString()}`} />
                      <InfoRow label="Tax amount" value={`${application.paymentIntent.currency} ${application.paymentIntent.taxAmount.toLocaleString()}`} />
                      <InfoRow label="Reference" value={application.paymentIntent.accountReference} />
                      <InfoRow label="Payment prompt ID" value={application.paymentIntent.checkoutRequestId ?? 'Not recorded'} />
                      <InfoRow label="Attached at" value={formatDateTime(application.paymentIntent.lockedAt)} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                No active payment intent is attached to this application.
              </div>
            )}

            {(application.mpesaC2BReceipts.length > 0 || application.paymentRecords.length > 0 || application.paymentProofHistory.length > 0) ? (
              <Collapsible className="mt-5 rounded-2xl border border-slate-200 bg-white">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700">
                  Full payment trail
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-5 border-t border-slate-200 px-4 py-4">
                  {application.mpesaC2BReceipts.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="text-base font-semibold text-slate-950">Paybill confirmations</h4>
                      {application.mpesaC2BReceipts.map((receipt) => (
                        <div key={receipt.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-emerald-700">
                              Paybill confirmed
                            </span>
                            <span className="font-medium text-slate-900">{receipt.transId}</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            <p><span className="font-medium text-slate-900">Amount:</span> KES {receipt.transAmount.toLocaleString()}</p>
                            <p><span className="font-medium text-slate-900">Phone:</span> {receipt.msisdn}</p>
                            <p><span className="font-medium text-slate-900">Confirmed at:</span> {formatDateTime(receipt.transTime ?? receipt.createdAt)}</p>
                            <p><span className="font-medium text-slate-900">Bill reference:</span> {receipt.billRefNumber ?? 'Not recorded'}</p>
                            <p><span className="font-medium text-slate-900">Decision:</span> {receipt.validationResultDesc ?? 'Accepted'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {application.paymentRecords.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="text-base font-semibold text-slate-950">Payment history</h4>
                      {application.paymentRecords.map((record) => (
                        <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <PaymentStatusBadge status={record.status} />
                            <span className="font-medium text-slate-900">{record.paymentMethod.replaceAll('_', ' ')} / {record.transactionReferenceNumber}</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <p><span className="font-medium text-slate-900">Paid at:</span> {formatDateTime(record.paidAt ?? record.createdAt)}</p>
                            <p><span className="font-medium text-slate-900">Recorded by:</span> {record.recordedBy?.name ?? record.recordedBy?.email ?? 'System'}</p>
                            <p><span className="font-medium text-slate-900">Notes:</span> {record.notes ?? 'No notes recorded'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {application.paymentProofHistory.length > 0 ? (
                    <div>
                      <h4 className="text-base font-semibold text-slate-950">Archived payment proofs</h4>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {application.paymentProofHistory.map((proof) => (
                          <Link
                            key={proof.id}
                            href={proof.paymentProofUrl}
                            target="_blank"
                            className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {proof.paymentProofOriginalName} / {proof.archivedAt.toLocaleDateString()}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          {(application.rejectionReason || application.reviewNotes || application.flaggedSections.length > 0 || application.flaggedFields.length > 0) ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
              <h3 className="text-lg font-semibold text-slate-950">Current feedback</h3>
              <div className="mt-4 space-y-4 text-sm text-slate-700">
                {application.rejectionReason ? <p><span className="font-medium">Reason:</span> {application.rejectionReason}</p> : null}
                {application.reviewNotes ? <p><span className="font-medium">Notes:</span> {application.reviewNotes}</p> : null}
                {application.flaggedSections.length > 0 ? (
                  <div>
                    <p className="font-medium text-slate-900">Flagged sections</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {application.flaggedSections.map((sectionId) => (
                        <span key={sectionId} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                          {getApplicationReviewSectionLabel(sectionId)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {application.flaggedFields.length > 0 ? (
                  <div>
                    <p className="font-medium text-slate-900">Flagged fields</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {application.flaggedFields.map((fieldId) => (
                        <span key={fieldId} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                          {getApplicationReviewFieldLabel(fieldId)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {application.status === 'ACTIVE' ? (
            <>
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-semibold">Application approved</p>
                    <p className="mt-1">This member is already active. Use the payment panel below only when you need to add another payment record manually.</p>
                  </div>
                </div>
              </div>

              <ManualPaymentRecordForm action={recordPaymentAction} defaultAmount={application.paymentTotalAmount} currency={application.currency} />
            </>
          ) : null}

          {application.status === 'REJECTED' ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-3">
                <FileWarning className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="font-semibold">Application currently rejected</p>
                  <p className="mt-1">The applicant will see this feedback and either update the saved profile or return to the application form for corrections.</p>
                </div>
              </div>
            </div>
          ) : null}

          {application.status === 'PENDING' ? (
            <>
              <form action={approveAction} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
                <h3 className="text-lg font-semibold text-slate-950">Approve</h3>
                <p className="mt-2 text-sm text-slate-600">Approve when the saved profile snapshot is consistent, the membership choice is correct, and payment is confirmed.</p>
                <button type="submit" className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Approve application
                </button>
              </form>

              <form action={rejectAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">Send back for correction</h3>
                    <p className="mt-1 text-sm text-slate-600">Point the applicant either to the saved profile or the application form, depending on what actually needs correction.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <input name="rejectionReason" placeholder="Short reason" className="flex h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
                  <textarea name="reviewNotes" placeholder="Notes explaining what should be corrected" className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Flag broad areas</p>
                    <div className="grid gap-2">
                      {applicationReviewSections.map((section) => (
                        <label key={section.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <input type="checkbox" name="flaggedSections" value={section.id} className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--brand)]" />
                          <span>{section.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Collapsible className="space-y-2">
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-medium text-slate-700">
                      Add detailed corrections
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="grid gap-2">
                      {applicationReviewFieldOptions.map((field) => (
                        <label key={field.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <input type="checkbox" name="flaggedFields" value={field.id} className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--brand)]" />
                          <span>{field.label}</span>
                        </label>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                <button type="submit" className="mt-5 inline-flex rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                  Reject application
                </button>
              </form>
            </>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
