import { AlertTriangle } from 'lucide-react';
import { AuthStatusCard } from '@/features/auth/components/auth-status-card';

type ErrorPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  AccessDenied: 'Access to this sign-in flow was denied.',
  Verification: 'That sign-in request is no longer valid. Try again.',
  OAuthAccountNotLinked: 'This email is already linked to a different sign-in method.',
  Configuration: 'Authentication is not configured correctly for this request.',
  Default: 'The sign-in request could not be completed.',
};

export default async function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const description = errorMessages[params.error ?? 'Default'] ?? errorMessages.Default;

  return (
    <AuthStatusCard
      title="Authentication error"
      description={description}
      icon={<AlertTriangle className="h-6 w-6" />}
      primaryHref="/auth/login"
      primaryLabel="Back to sign in"
    />
  );
}
