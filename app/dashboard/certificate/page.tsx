import { redirect } from 'next/navigation';
import { Award, BadgeCheck, CalendarDays, ShieldCheck } from 'lucide-react';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { PrintCertificateButton } from '@/features/application/components/print-certificate-button';
import { getMemberPortalContext } from '@/features/application/queries/member-portal';

function formatCertificateDate(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'long',
  }).format(value);
}

export default async function CertificatePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login?callbackUrl=%2Fdashboard%2Fcertificate');
  }

  const { application, portalSetting, policy } = await getMemberPortalContext(session.user.id);

  if (!application || !policy.canViewCertificate) {
    redirect('/dashboard');
  }

  const memberName = `${application.firstName} ${application.surname}`.trim();
  const organizationName = portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME;
  const organizationShortName = portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME;

  return (
    <AppShell
      currentPath="/dashboard/certificate"
      heading="Digital certificate"
      description="Print or save your certificate when your current portal access allows it."
      canAccessApplicationForm={policy.canAccessApplicationForm}
      canViewCertificate={policy.canViewCertificate}
      canViewMembershipCard={policy.canViewMembershipCard}
      accountState={policy.membershipStateLabel}
      organizationName={organizationName}
      organizationShortName={organizationShortName}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">Certificate status</p>
          <p className="text-sm text-slate-600">{policy.renewalSummary}</p>
        </div>
        <PrintCertificateButton />
      </div>

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] print:border-none print:shadow-none">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand)_18%,white)_0%,white_48%,color-mix(in_oklab,var(--brand)_9%,white)_100%)] px-8 py-8 print:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">{organizationName}</p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Certificate of Membership</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                This certifies that the member named below holds current certificate access in the member portal.
              </p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-[var(--brand-border)] bg-white/90 text-[var(--brand)] shadow-sm">
              <Award className="h-10 w-10" />
            </div>
          </div>
        </div>

        <div className="grid gap-8 px-8 py-8 lg:grid-cols-[1.2fr_0.8fr] print:px-10">
          <div className="space-y-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Presented to</p>
              <p className="mt-3 text-4xl font-semibold text-slate-950">{memberName}</p>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700">
                Issued from the approved membership record and linked to the member profile shown below.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Membership ID</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{application.membershipNumber ?? 'Pending assignment'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Membership category</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{application.membershipCategory}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Approval date</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatCertificateDate(application.reviewedAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current access</p>
                <p className="mt-2 text-lg font-semibold text-emerald-700">{policy.membershipStateLabel}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-6">
              <div className="flex items-center gap-3 text-[var(--brand)]">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">Verified record</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                This certificate is generated from the approved membership record stored in the membership portal.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3 text-slate-900">
                <BadgeCheck className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">Member summary</p>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><span className="font-medium text-slate-900">Email:</span> {application.email}</p>
                <p><span className="font-medium text-slate-900">Phone:</span> {application.phoneNumber}</p>
                <p><span className="font-medium text-slate-900">County:</span> {application.county}</p>
                <p><span className="font-medium text-slate-900">Renewal:</span> {policy.renewalSummary}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3 text-slate-900">
                <CalendarDays className="h-5 w-5 text-[var(--brand)]" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">Issued by portal</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Generated on {formatCertificateDate(new Date())}. Keep this certificate together with your membership ID for official reference.
              </p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
