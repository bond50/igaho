import { ShieldAlert } from 'lucide-react';
import { AuthStatusCard } from '@/features/auth/components/auth-status-card';

export default function UnauthorizedPage() {
  return (
    <AuthStatusCard
      title="Unauthorized sign-in"
      description="This sign-in method is not permitted for your account."
      icon={<ShieldAlert className="h-6 w-6" />}
      primaryHref="/auth/login"
      primaryLabel="Back to sign in"
    />
  );
}
