import { getPortalBranding } from '@/features/application/queries/settings';
import { VerifyEmailForm } from '@/features/auth/components/verify-email-form';

type VerifyEmailPageProps = {
  searchParams: Promise<{
    email?: string;
  }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const [params, branding] = await Promise.all([searchParams, getPortalBranding()]);

  return <VerifyEmailForm initialEmail={params.email} organizationName={branding.organizationName} />;
}
