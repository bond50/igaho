import { getPortalBranding } from '@/features/application/queries/settings';
import { AuthAccessForm } from '@/features/auth/components/auth-access-form';

export default async function RegisterPage() {
  const branding = await getPortalBranding();

  return <AuthAccessForm organizationName={branding.organizationName} />;
}
