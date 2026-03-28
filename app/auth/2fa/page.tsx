import { getPortalBranding } from '@/features/application/queries/settings';
import { ChallengeForm } from '@/features/auth/components/challenge-form';

type ChallengePageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function TwoFactorPage({ searchParams }: ChallengePageProps) {
  const [params, branding] = await Promise.all([searchParams, getPortalBranding()]);

  return <ChallengeForm next={params.next} organizationName={branding.organizationName} />;
}
