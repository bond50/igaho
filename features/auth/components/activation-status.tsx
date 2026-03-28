// features/auth/components/activation-status.tsx
import { CheckCircle2, MailWarning } from 'lucide-react';
import { AuthStatusCard } from '@/features/auth/components/auth-status-card';

type ActivationStatusProps = {
  success?: string;
  error?: string;
};

export function ActivationStatus({ success, error }: ActivationStatusProps) {
  if (success) {
    return (
      <AuthStatusCard
        title="Account activated"
        description={success}
        icon={<CheckCircle2 className="h-6 w-6" />}
        primaryHref="/dashboard"
        primaryLabel="Open dashboard"
      />
    );
  }

  return (
    <AuthStatusCard
      title="Activation required"
      description={error ?? 'This activation link is not valid anymore. Request a fresh one to continue.'}
      icon={<MailWarning className="h-6 w-6" />}
      primaryHref="/auth/verify-email"
      primaryLabel="Request new link"
      secondaryHref="/auth/login"
      secondaryLabel="Back to sign in"
    />
  );
}
