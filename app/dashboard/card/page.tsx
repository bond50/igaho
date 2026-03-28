import { redirect } from 'next/navigation';
import { BadgeCheck, CreditCard, ShieldCheck, UserRound } from 'lucide-react';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { PrintPageButton } from '@/features/application/components/print-page-button';
import { getMemberPortalContext } from '@/features/application/queries/member-portal';

function formatDate(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'long' }).format(value);
}

export default async function MemberCardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login?callbackUrl=%2Fdashboard%2Fcard');
  }

  const { application, portalSetting, policy } = await getMemberPortalContext(session.user.id);

  if (!application || !policy.canViewMembershipCard) {
    redirect('/dashboard');
  }

  const memberName = `${application.firstName} ${application.surname}`.trim();
  const organizationName = portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME;
  const organizationShortName = portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME;

  return (
    <AppShell
      currentPath="/dashboard/card"
      heading="Membership card"
      description="Use your digital member card whenever your current portal access allows it."
      canAccessApplicationForm={policy.canAccessApplicationForm}
      canViewCertificate={policy.canViewCertificate}
      canViewMembershipCard={policy.canViewMembershipCard}
      accountState={policy.membershipStateLabel}
      organizationName={organizationName}
      organizationShortName={organizationShortName}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="text-sm font-medium text-slate-900">Card status</p>
          <p className="text-sm text-slate-600">{policy.renewalSummary}</p>
        </div>
        <PrintPageButton label="Print membership card" />
      </div>

      <section className="mx-auto w-full max-w-3xl print:max-w-none">
        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_55%,color-mix(in_oklab,var(--brand)_55%,#0f172a)_100%)] text-white shadow-[0_20px_70px_rgba(15,23,42,0.22)] print:shadow-none">
          <div className="grid gap-8 p-8 md:grid-cols-[1.15fr_0.85fr] print:p-10">
            <div className="space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">{organizationName}</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">Member card</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
                  This card confirms the holder below is currently recognized in the Association member register.
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">Member name</p>
                <p className="mt-2 text-3xl font-semibold">{memberName}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Membership ID</p>
                  <p className="mt-2 text-xl font-semibold">{application.membershipNumber ?? 'Pending assignment'}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Category</p>
                  <p className="mt-2 text-xl font-semibold">{application.membershipCategory}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-6">
              <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/20 bg-white/12 backdrop-blur-sm">
                <CreditCard className="h-12 w-12 text-white" />
              </div>

              <div className="space-y-4 rounded-[28px] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="h-5 w-5 text-emerald-300" />
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">Member summary</p>
                </div>
                <div className="space-y-3 text-sm text-white/80">
                  <p><span className="font-medium text-white">Status:</span> {policy.membershipStateLabel}</p>
                  <p><span className="font-medium text-white">County:</span> {application.county}</p>
                  <p><span className="font-medium text-white">Approved:</span> {formatDate(application.reviewedAt)}</p>
                  <p><span className="font-medium text-white">Renewal:</span> {policy.renewalSummary}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-white/70">
                <ShieldCheck className="h-4 w-4" />
                <span>Generated from the protected member portal record</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/12 px-8 py-5 text-xs uppercase tracking-[0.22em] text-white/60 print:px-10">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              <span>{application.email}</span>
            </div>
            <span>{application.membershipType.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
