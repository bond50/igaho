import * as React from 'react';

import { ApplicationNotificationEmail } from '@/features/application/components/emails/application-notification-email';
import { getAdminNotificationRecipients } from '@/features/auth/queries/user';
import { sendEmail } from '@/lib/email/resend';

const CLIENT_URL = process.env.CLIENT_URL ?? process.env.NEXT_PUBLIC_CLIENT_URL ?? '';

function buildAbsoluteUrl(path: string) {
  if (!CLIENT_URL) return path;
  return `${CLIENT_URL}${path}`;
}

async function sendBestEffortEmail(args: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(args);
  } catch (error) {
    console.error('Application notification email failed', error);
  }
}

export async function notifyAdminsOfSubmittedApplication({
  applicationId,
  applicantName,
  applicantEmail,
  county,
  membershipCategory,
  paymentCollectionMode,
  paymentStatusLabel,
  paymentReference,
  totalAmount,
  currency,
  applicationStatus,
}: {
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  county: string;
  membershipCategory: string;
  paymentCollectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
  paymentStatusLabel: string;
  paymentReference?: string | null;
  totalAmount: number;
  currency: string;
  applicationStatus: 'PENDING' | 'ACTIVE';
}) {
  const recipients = await getAdminNotificationRecipients();
  if (recipients.length === 0) {
    return;
  }

  const isMpesa = paymentCollectionMode === 'MPESA_DARAJA';
  const isAutoApproved = applicationStatus === 'ACTIVE';
  const reviewUrl = buildAbsoluteUrl(`/dashboard/applications/${applicationId}`);

  await sendBestEffortEmail({
    to: recipients,
    subject: isAutoApproved
      ? 'Membership application auto-approved after verified payment'
      : isMpesa
        ? 'New membership application submitted with verified payment'
        : 'New membership application submitted',
    suppressReplies: true,
    react: (
      <ApplicationNotificationEmail
        preview={
          isAutoApproved
            ? 'A membership application was approved automatically after verified payment.'
            : isMpesa
              ? 'A new membership application is waiting for review with payment already verified.'
              : 'A new membership application is waiting for review and payment proof verification.'
        }
        title={isAutoApproved ? 'Membership application auto-approved' : 'New membership application submitted'}
        lead={
          isAutoApproved
            ? 'A new application was submitted and approved automatically because verified payment matched the active portal policy.'
            : isMpesa
              ? 'A new application has been submitted. The M-Pesa payment was already verified and attached before submission.'
              : 'A new application has been submitted. Review the uploaded payment proof, then approve or reject the application.'
        }
        details={[
          { label: 'Applicant', value: applicantName },
          { label: 'Email', value: applicantEmail },
          { label: 'County', value: county },
          { label: 'Membership category', value: membershipCategory },
          { label: 'Application status', value: applicationStatus === 'ACTIVE' ? 'Approved automatically' : 'Pending review' },
          { label: 'Payment mode', value: isMpesa ? 'M-Pesa Daraja' : 'Manual proof upload' },
          { label: 'Payment status', value: paymentStatusLabel },
          { label: 'Amount', value: `${currency} ${totalAmount.toLocaleString()}` },
          ...(paymentReference ? [{ label: isMpesa ? 'Payment reference' : 'Transaction reference', value: paymentReference }] : []),
          { label: 'Review page', value: reviewUrl },
        ]}
        note={
          isAutoApproved
            ? 'Open the application record to review the approved member details and payment attachment.'
            : isMpesa
              ? 'Open the application record to review the submission details and make the approval decision.'
              : 'Open the application record to verify the payment proof and make the approval decision.'
        }
      />
    ),
  });
}


export async function notifyApplicantOfSubmittedApplication({
  email,
  applicantName,
  membershipCategory,
  paymentCollectionMode,
  paymentStatusLabel,
  paymentReference,
  totalAmount,
  currency,
}: {
  email: string;
  applicantName: string;
  membershipCategory: string;
  paymentCollectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
  paymentStatusLabel: string;
  paymentReference?: string | null;
  totalAmount: number;
  currency: string;
}) {
  const isMpesa = paymentCollectionMode === 'MPESA_DARAJA';

  await sendBestEffortEmail({
    to: email,
    subject: 'Your membership application was submitted',
    suppressReplies: true,
    react: (
      <ApplicationNotificationEmail
        preview="Your membership application was submitted successfully."
        title="Membership application submitted"
        lead={
          isMpesa
            ? `Hello ${applicantName}, your application was submitted successfully and your verified M-Pesa payment has been attached.`
            : `Hello ${applicantName}, your application was submitted successfully and is waiting for payment proof review.`
        }
        details={[
          { label: 'Status', value: 'Pending review' },
          { label: 'Membership category', value: membershipCategory },
          { label: 'Payment mode', value: isMpesa ? 'M-Pesa Daraja' : 'Manual proof upload' },
          { label: 'Payment status', value: paymentStatusLabel },
          { label: 'Amount', value: `${currency} ${totalAmount.toLocaleString()}` },
          ...(paymentReference ? [{ label: isMpesa ? 'Payment reference' : 'Transaction reference', value: paymentReference }] : []),
          { label: 'Portal', value: buildAbsoluteUrl('/dashboard') },
        ]}
        note={
          isMpesa
            ? 'Your application is now waiting for final review. We will notify you once a decision is made.'
            : 'Your uploaded payment proof will be reviewed by an administrator before a decision is made.'
        }
      />
    ),
  });
}

export async function notifyApplicantOfApprovedApplication({
  email,
  applicantName,
  membershipNumber,
}: {
  email: string;
  applicantName: string;
  membershipNumber: string;
}) {
  await sendBestEffortEmail({
    to: email,
    subject: 'Your membership application was approved',
    suppressReplies: true,
    react: (
      <ApplicationNotificationEmail
        preview="Your membership application has been approved."
        title="Membership application approved"
        lead={`Hello ${applicantName}, your membership application has been approved.`}
        details={[
          { label: 'Status', value: 'ACTIVE' },
          { label: 'Membership ID', value: membershipNumber },
          { label: 'Portal', value: buildAbsoluteUrl('/dashboard') },
        ]}
        note="You can now sign in and continue using the member portal as new features are enabled."
      />
    ),
  });
}

export async function notifyApplicantOfRejectedApplication({
  email,
  applicantName,
  reason,
  reviewNotes,
}: {
  email: string;
  applicantName: string;
  reason: string;
  reviewNotes?: string | null;
}) {
  await sendBestEffortEmail({
    to: email,
    subject: 'Your membership application was not approved',
    suppressReplies: true,
    react: (
      <ApplicationNotificationEmail
        preview="Your membership application review is complete."
        title="Membership application rejected"
        lead={`Hello ${applicantName}, your membership application was reviewed and is currently marked as rejected.`}
        details={[
          { label: 'Status', value: 'REJECTED' },
          { label: 'Reason', value: reason },
          ...(reviewNotes ? [{ label: 'Reviewer notes', value: reviewNotes }] : []),
          { label: 'Portal', value: buildAbsoluteUrl('/dashboard') },
        ]}
        note="Open the dashboard to review the rejection details and revise your application."
      />
    ),
  });
}
