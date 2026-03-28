import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { ApplicantProfileForm } from '@/features/application/components/applicant-profile-form';
import { getApplicantProfileByUserId, getApplicationByUserId } from '@/features/application/queries/application';
import { getMemberPortalContext } from '@/features/application/queries/member-portal';
import { getApplicantProfileCompletion } from '@/features/application/lib/profile-onboarding';

function toObject(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login?callbackUrl=%2Fprofile');
  }

  const [{ policy, portalSetting }, applicantProfile, application] = await Promise.all([
    getMemberPortalContext(session.user.id),
    getApplicantProfileByUserId(session.user.id),
    getApplicationByUserId(session.user.id),
  ]);

  const profileCompletion = getApplicantProfileCompletion(application, applicantProfile);
  const profileComplete = profileCompletion.isComplete;
  const onboardingLocked =
    !application || application.status === 'DRAFT' || application.status === 'REJECTED';
  const initialValues = {
    ...toObject(application),
    ...toObject(applicantProfile?.data),
  };
  const canContinueToApplication = profileComplete && (!application || application.status === 'DRAFT' || application.status === 'REJECTED' || policy.canAccessApplicationForm);

  return (
    <AppShell
      currentPath="/profile"
      isAdmin={session.user.role === 'ADMIN'}
      heading="My profile"
      description={
        profileComplete
          ? 'Your profile is up to date.'
          : 'Complete your profile to continue.'
      }
      canAccessApplicationForm={policy.canAccessApplicationForm}
      canViewCertificate={policy.canViewCertificate}
      canViewMembershipCard={policy.canViewMembershipCard}
      onboardingLocked={onboardingLocked}
      profileIncomplete={!profileComplete}
      accountState={policy.membershipStateLabel}
      organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
      organizationShortName={portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME}
      pageActions={
        <>
          {canContinueToApplication ? (
            <Link href="/apply" className="inline-flex rounded-xl border border-[var(--brand)] bg-white px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]">
              Continue to application
            </Link>
          ) : null}
          {policy.canViewCertificate ? (
            <Link href="/dashboard/certificate" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Certificate
            </Link>
          ) : null}
          {policy.canViewMembershipCard ? (
            <Link href="/dashboard/card" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Membership card
            </Link>
          ) : null}
        </>
      }
    >
      <ApplicantProfileForm email={session.user.email ?? ''} initialValues={initialValues} />
    </AppShell>
  );
}
