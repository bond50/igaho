import { redirect } from 'next/navigation';

import { ActivationStatus } from '@/features/auth/components/activation-status';

type VerificationPageProps = {
  searchParams: Promise<{
    token?: string;
    error?: string;
  }>;
};

function getErrorMessage(error?: string) {
  if (error === 'missing') {
    return 'Verification link is missing or invalid.';
  }

  if (error === 'invalid') {
    return 'Verification link is invalid, expired, or already used.';
  }

  return undefined;
}

export default async function NewVerificationPage({ searchParams }: VerificationPageProps) {
  const params = await searchParams;

  if (params.token) {
    redirect(`/auth/activate?token=${encodeURIComponent(params.token)}`);
  }

  return <ActivationStatus error={getErrorMessage(params.error)} />;
}
