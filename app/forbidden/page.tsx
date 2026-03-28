import { LockKeyhole } from 'lucide-react';
import { AuthStatusCard } from '@/features/auth/components/auth-status-card';

export default function ForbiddenPage() {
  return (
    <AuthStatusCard
      title="Access forbidden"
      description="You are signed in, but your account does not have access to this area."
      icon={<LockKeyhole className="h-6 w-6" />}
      primaryHref="/auth/login"
      primaryLabel="Use a different account"
    />
  );
}
