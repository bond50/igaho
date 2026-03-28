import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AppShell } from '@/components/layout/app-shell';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { ApplicationSettingsPanel } from '@/features/application/components/application-settings-panel';
import { getHeaderNotifications } from '@/features/application/queries/application';
import { getApplicationPortalReadiness, getApplicationPortalSettingWithDefaults, getMembershipCategories } from '@/features/application/queries/settings';
import { getDarajaC2BConfigStatus } from '@/features/payments/lib/daraja';

export default async function DashboardSetupAssistantPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const [portalSetting, readiness, categories, notifications] = await Promise.all([
    getApplicationPortalSettingWithDefaults(),
    getApplicationPortalReadiness(),
    getMembershipCategories(),
    getHeaderNotifications(true, session.user.id),
  ]);

  const c2bStatus = getDarajaC2BConfigStatus({
    shortCode: portalSetting?.c2bShortCode ?? portalSetting?.mpesaShortCode ?? portalSetting?.mpesaPaybillNumber,
  });

  return (
    <AppShell
      currentPath="/dashboard/setup-assistant"
      isAdmin
      notifications={notifications}
      organizationName={portalSetting?.setupName ?? DEFAULT_ORGANIZATION_NAME}
      organizationShortName={portalSetting?.shortName ?? DEFAULT_ORGANIZATION_SHORT_NAME}
      heading="Setup assistant"
      description="Run the guided portal setup flow."
      pageActions={
        <>
          <Link href="/dashboard/settings" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Open full settings
          </Link>
          <Link href="/dashboard" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Back to dashboard
          </Link>
        </>
      }
    >
      <ApplicationSettingsPanel
        portalSetting={portalSetting ? {
          ...portalSetting,
          c2bRegisteredAt: portalSetting.c2bRegisteredAt?.toISOString() ?? null,
        } : null}
        c2bStatus={c2bStatus}
        readiness={readiness}
        categories={categories}
        startInWizard
        standaloneAssistant
      />
    </AppShell>
  );
}
