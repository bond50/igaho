import { getPortalBranding } from '@/features/application/queries/settings';
import { NewPasswordForm } from '@/features/auth/components/new-password-form';
import { getPasswordResetTokenByToken } from '@/features/auth/queries/password-reset-token';

type NewPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function NewPasswordPage({ searchParams }: NewPasswordPageProps) {
  const params = await searchParams;
  const [resetToken, branding] = await Promise.all([
    params.token ? getPasswordResetTokenByToken(params.token) : null,
    getPortalBranding(),
  ]);

  return <NewPasswordForm token={params.token} email={resetToken?.email ?? ''} organizationName={branding.organizationName} />;
}
