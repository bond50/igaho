import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { DashboardSettingsTabs } from '@/features/application/components/dashboard-settings-tabs';
import { getApplicationLinkOptions, getHeaderNotifications } from '@/features/application/queries/application';
import { getApplicationPortalReadiness, getApplicationPortalSettingWithDefaults, getMembershipCategories } from '@/features/application/queries/settings';
import { getDarajaStatus, getRecentMpesaStkRequests } from '@/features/payments/queries/daraja';
import { getDarajaC2BConfigStatus } from '@/features/payments/lib/daraja';

export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const openSetupAssistant = resolvedSearchParams.assistant === '1';

  const [portalSetting, readiness, categories, recentDarajaRequests, applicationOptions, notifications] = await Promise.all([
    getApplicationPortalSettingWithDefaults(),
    getApplicationPortalReadiness(),
    getMembershipCategories(),
    getRecentMpesaStkRequests(),
    getApplicationLinkOptions(),
    getHeaderNotifications(true, session.user.id),
  ]);

  const darajaStatus = getDarajaStatus({
    shortCode: portalSetting?.mpesaShortCode,
    transactionType: (portalSetting?.darajaTransactionType as 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline' | null) ?? undefined,
  });
  const c2bStatus = getDarajaC2BConfigStatus({
    shortCode: portalSetting?.c2bShortCode ?? portalSetting?.mpesaShortCode ?? portalSetting?.mpesaPaybillNumber,
  });

  return (
    <AppShell
      currentPath="/dashboard/settings"
      isAdmin
      notifications={notifications}
      organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
      organizationShortName={portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME}
      heading="Application settings"
      description="Manage application intake, payment collection, and category setup."
      pageActions={
        <>
          <Link href="/dashboard/payments" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Payment operations
          </Link>
          <Link href="/dashboard" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Back to dashboard
          </Link>
        </>
      }
    >
      <DashboardSettingsTabs
        portalSetting={portalSetting ? {
          ...portalSetting,
          c2bRegisteredAt: portalSetting.c2bRegisteredAt?.toISOString() ?? null,
        } : null}
        readiness={readiness}
        categories={categories}
        openSetupAssistant={openSetupAssistant}
        darajaStatus={darajaStatus}
        c2bStatus={c2bStatus}
        applicationOptions={applicationOptions.map((application) => ({
          id: application.id,
          label: `${application.firstName} ${application.surname}`.trim() || application.email,
          description: `${application.email} · ${application.status} · ${application.membershipCategory} · ${application.county}`,
        }))}
        recentRequests={recentDarajaRequests.map((request) => ({
          ...request,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
          lastReconciledAt: request.lastReconciledAt?.toISOString() ?? null,
        }))}
      />
    </AppShell>
  );
}
