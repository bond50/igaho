import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { ApplicationRegisterForm } from '@/features/application/components/application-register-form';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { buildDraftFromRejectedApplication } from '@/features/application/lib/application-draft';
import { getApplicantProfileCompletion } from '@/features/application/lib/profile-onboarding';
import { splitApplicationFormData } from '@/features/application/lib/field-ownership';
import { getApplicationReviewFieldLabel } from '@/features/application/lib/review-fields';
import { getApplicationReviewSectionLabel } from '@/features/application/lib/review-sections';
import { getApplicantProfileByUserId, getApplicationByUserId, getApplicationDraftByUserId } from '@/features/application/queries/application';
import { getMemberPortalPolicyByUserId } from '@/features/application/queries/member-portal';
import { getApplicationPortalReadiness, getApplicationPortalSetting, getMembershipCategories } from '@/features/application/queries/settings';
import { AuthStatusCard } from '@/features/auth/components/auth-status-card';
import { getUserById } from '@/features/auth/queries/user';
import { getApplicantActivePaymentIntent, getLatestApplicantMpesaRequest } from '@/features/payments/queries/daraja';

export default async function ApplyPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login?callbackUrl=%2Fapply');
  }

  const user = await getUserById(session.user.id);
  if (!user?.emailVerified) {
    return (
      <AuthStatusCard
        title="Verify your email first"
        description="Your account is already signed in. Open the verification email we sent you, then continue to the membership application."
        primaryHref="/auth/verify-email"
        primaryLabel="Request new link"
        secondaryHref="/dashboard"
        secondaryLabel="Back to dashboard"
      />
    );
  }

  const [application, draft, applicantProfile, readiness, portalSetting, membershipCategories, latestMpesaRequest, paymentIntent, policy] = await Promise.all([
    getApplicationByUserId(session.user.id),
    getApplicationDraftByUserId(session.user.id),
    getApplicantProfileByUserId(session.user.id),
    getApplicationPortalReadiness(),
    getApplicationPortalSetting(),
    getMembershipCategories({ activeOnly: true }),
    getLatestApplicantMpesaRequest(session.user.id),
    getApplicantActivePaymentIntent(session.user.id),
    getMemberPortalPolicyByUserId(session.user.id),
  ]);

  if (application?.status === 'PENDING' || (application?.status === 'ACTIVE' && !policy.canAccessApplicationForm)) {
    redirect('/dashboard');
  }

  if (!readiness.isReady) {
    return (
      <AppShell
        currentPath="/apply"
        isAdmin={session.user.role === 'ADMIN'}
        heading="Membership application"
        description="The application portal is configured by administrators and will only open when all required options are ready."
        organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
        organizationShortName={portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME}
      >
        <section className="space-y-6 rounded-3xl border border-amber-200 bg-amber-50 p-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Portal status</p>
            <h2 className="text-2xl font-semibold text-slate-950">Applications are not ready to receive submissions</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-700">{readiness.applicantMessage}</p>
          </div>

          {session.user.role === 'ADMIN' ? (
            <>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">What is blocking the form</p>
                <ul className="space-y-2 text-sm text-slate-700">
                  {readiness.issues.map((issue) => (
                    <li key={issue.key} className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
                      {issue.message}{' '}
                      <Link href={issue.href} className="font-semibold text-[var(--brand)] underline underline-offset-4">
                        Fix this in settings
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <Link href="/dashboard/settings" className="inline-flex rounded-xl border border-[var(--brand)] bg-white px-4 py-2 text-sm font-semibold text-[var(--brand)] shadow-sm transition-colors hover:bg-[var(--brand-soft)]">
                  Open application settings
                </Link>
              </div>
            </>
          ) : null}
        </section>
      </AppShell>
    );
  }

  const profileReady = getApplicantProfileCompletion(application, applicantProfile).parsed;

  if (!profileReady.success) {
    const fieldErrors = profileReady.error.flatten().fieldErrors;
    const missingItems = Object.entries(fieldErrors)
      .filter(([, errors]) => Array.isArray(errors) && errors.length > 0)
      .map(([field]) => getApplicationReviewFieldLabel(field));

    return (
      <AppShell
        currentPath="/apply"
        isAdmin={session.user.role === 'ADMIN'}
        heading="Complete your profile first"
        description="Your profile now holds the reusable details used across applications, payments, certificates, and membership records."
        canAccessApplicationForm={policy.canAccessApplicationForm}
        canViewCertificate={policy.canViewCertificate}
        canViewMembershipCard={policy.canViewMembershipCard}
        onboardingLocked
        profileIncomplete
        accountState={policy.membershipStateLabel}
        organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
        organizationShortName={portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME}
      >
        <section className="space-y-6 rounded-3xl border border-amber-200 bg-amber-50 p-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Profile required</p>
            <h2 className="text-2xl font-semibold text-slate-950">Finish your saved member profile before starting the application</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-700">
              The application form now only covers membership choice, payment, and declaration. Identity, contact, and professional details are managed in your profile.
            </p>
          </div>

          {missingItems.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Update these profile areas first</p>
              <div className="flex flex-wrap gap-2">
                {missingItems.map((item) => (
                  <span key={item} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-800">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <Link
              href="/profile"
              className="inline-flex rounded-xl border border-[var(--brand)] bg-white px-4 py-2 text-sm font-semibold text-[var(--brand)] shadow-sm transition-colors hover:bg-[var(--brand-soft)]"
            >
              Open profile
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  const derivedRejectedDraft = !draft?.data && application?.status === 'REJECTED' ? buildDraftFromRejectedApplication(application) : null;
  const splitDraft = splitApplicationFormData(((draft?.data as Record<string, unknown> | null) ?? {}));
  const splitRejectedDraft = splitApplicationFormData(((derivedRejectedDraft as Record<string, unknown> | null) ?? {}));

  const mergedInitialDraft = {
    ...splitRejectedDraft.applicationData,
    ...splitDraft.applicationData,
  };

  const revisionContext = application?.status === 'REJECTED'
    ? {
        rejectionReason: application.rejectionReason,
        reviewNotes: application.reviewNotes,
        flaggedSections: application.flaggedSections.map((sectionId) => ({ id: sectionId, label: getApplicationReviewSectionLabel(sectionId) })),
        flaggedFields: application.flaggedFields.map((fieldId) => ({ id: fieldId, label: getApplicationReviewFieldLabel(fieldId) })),
        requiresNewPaymentProof: application.flaggedFields.includes('paymentProof') || application.flaggedSections.includes('payment-declaration'),
        resubmissionCount: application.resubmissionCount,
      }
    : null;
  const onboardingLocked =
    !application || application.status === 'DRAFT' || application.status === 'REJECTED';

  return (
    <AppShell
      currentPath="/apply"
      isAdmin={session.user.role === 'ADMIN'}
      heading="Membership application"
      description=""
      canAccessApplicationForm={policy.canAccessApplicationForm}
      canViewCertificate={policy.canViewCertificate}
      canViewMembershipCard={policy.canViewMembershipCard}
      onboardingLocked={onboardingLocked}
      profileIncomplete={!profileReady.success}
      accountState={policy.membershipStateLabel}
      organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
      organizationShortName={portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME}
    >
      <ApplicationRegisterForm
        email={session.user.email ?? ''}
        fullName={session.user.name}
        initialDraft={mergedInitialDraft}
        initialStep={draft?.currentStep ?? 0}
        initialSavedAt={draft?.updatedAt.toISOString() ?? application?.updatedAt.toISOString() ?? null}
        revisionContext={revisionContext}
        paymentConfiguration={readiness.paymentConfiguration}
        paymentIntent={paymentIntent ? {
          status: paymentIntent.status,
          payerPhoneNumber: paymentIntent.payerPhoneNumber,
          baseAmount: paymentIntent.baseAmount,
          taxAmount: paymentIntent.taxAmount,
          totalAmount: paymentIntent.totalAmount,
          currency: paymentIntent.currency,
          accountReference: paymentIntent.accountReference,
          receiptNumber: paymentIntent.mpesaReceiptNumber,
          checkoutRequestId: paymentIntent.checkoutRequestId,
          lastError: paymentIntent.lastError,
          verifiedAt: paymentIntent.verifiedAt?.toISOString() ?? null,
          lockedAt: paymentIntent.lockedAt?.toISOString() ?? null,
          createdAt: paymentIntent.createdAt.toISOString(),
          updatedAt: paymentIntent.updatedAt.toISOString(),
        } : null}
        latestMpesaRequest={latestMpesaRequest ? {
          status: latestMpesaRequest.status,
          payerPhoneNumber: latestMpesaRequest.phoneNumber,
          amount: latestMpesaRequest.amount,
          checkoutRequestId: latestMpesaRequest.checkoutRequestId,
          receiptNumber: latestMpesaRequest.mpesaReceiptNumber,
          updatedAt: latestMpesaRequest.updatedAt.toISOString(),
          resultCode: latestMpesaRequest.resultCode,
          resultDesc: latestMpesaRequest.resultDesc,
          reconciliationAttemptCount: latestMpesaRequest.reconciliationAttemptCount,
          lastReconciledAt: latestMpesaRequest.lastReconciledAt?.toISOString() ?? null,
          lastReconciliationSource: latestMpesaRequest.lastReconciliationSource,
          lastReconciliationNote: latestMpesaRequest.lastReconciliationNote,
        } : null}
        organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
        membershipCategories={membershipCategories.map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
        }))}
      />
    </AppShell>
  );
}




