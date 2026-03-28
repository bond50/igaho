import { getPortalBranding } from '@/features/application/queries/settings';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

export default async function ResetPage() {
  const branding = await getPortalBranding();

  return <ResetPasswordForm organizationName={branding.organizationName} />;
}
