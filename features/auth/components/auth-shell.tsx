// features/auth/components/auth-shell.tsx
import Link from 'next/link';
import { DEFAULT_ORGANIZATION_NAME } from '@/features/application/lib/portal-branding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AuthShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  footerText?: string;
  footerLinkHref?: string;
  footerLinkLabel?: string;
  organizationName?: string;
};

export function AuthShell({
  title,
  description,
  children,
  footerText,
  footerLinkHref,
  footerLinkLabel,
  organizationName = DEFAULT_ORGANIZATION_NAME,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4 py-8">
      <Card className="animate-[auth-fade-in_420ms_ease-out] w-full max-w-md rounded-[20px] border-slate-200 bg-white shadow-[0_8px_24px_rgba(16,32,51,0.05)]">
        <CardHeader className="space-y-2 px-8 pt-8">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
              {organizationName}
            </p>
            <CardTitle className="text-[1.65rem] leading-tight">{title}</CardTitle>
            {description ? <CardDescription className="text-[0.92rem] leading-6">{description}</CardDescription> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
          {children}
          {footerText && footerLinkHref && footerLinkLabel ? (
            <p className="text-sm text-slate-600">
              {footerText}{' '}
              <Link href={footerLinkHref} className="font-semibold text-[var(--brand)] hover:opacity-85">
                {footerLinkLabel}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
