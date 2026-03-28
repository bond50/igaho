// features/auth/components/auth-status-card.tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getPortalBranding } from '@/features/application/queries/settings';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AuthStatusCardProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  organizationName?: string;
};

export async function AuthStatusCard({
  title,
  description,
  icon,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  organizationName,
}: AuthStatusCardProps) {
  const branding = organizationName ? { organizationName } : await getPortalBranding();

  return (
    <AuthShell title={title} description={description} organizationName={organizationName ?? branding.organizationName}>
      <div className="space-y-5">
        {icon ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            {icon}
          </div>
        ) : null}

        {(primaryHref && primaryLabel) || (secondaryHref && secondaryLabel) ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            {primaryHref && primaryLabel ? (
              <Link href={primaryHref} className={cn(buttonVariants({ size: 'default' }), 'flex-1')}>
                {primaryLabel}
              </Link>
            ) : null}

            {secondaryHref && secondaryLabel ? (
              <Link href={secondaryHref} className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'flex-1')}>
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}
