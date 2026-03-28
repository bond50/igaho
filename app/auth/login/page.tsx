import { getPortalBranding } from '@/features/application/queries/settings';
import { AuthAccessForm } from '@/features/auth/components/auth-access-form';

type LoginPageProps = {
  searchParams?: Promise<{
    email?: string;
    verified?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const branding = await getPortalBranding();
  const params = (await searchParams) ?? {};
  const initialEmail = typeof params.email === 'string' ? params.email : '';
  const initialMode = initialEmail ? 'login' : 'email';
  const initialSuccessMessage =
    params.verified === '1' && initialEmail
      ? 'Email verified. Enter your password to continue.'
      : undefined;

  return (
    <AuthAccessForm
      organizationName={branding.organizationName}
      initialEmail={initialEmail}
      initialMode={initialMode}
      initialSuccessMessage={initialSuccessMessage}
    />
  );
}
