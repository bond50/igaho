"use client";

import Link from 'next/link';
import {Home} from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

type AppBreadcrumbProps = {
  items: string[];
};

export function AppBreadcrumb({items}: AppBreadcrumbProps) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <Breadcrumb className="mb-1">
      <BreadcrumbList className="gap-1.5 text-[11px] text-slate-400 sm:gap-2 sm:text-xs">
        {items.map((crumb, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <div key={`${crumb}-${index}`} className="contents">
              <BreadcrumbItem className="min-w-0 gap-1.5 sm:gap-2">
                {index === 0 ? <Home className="h-[11px] w-[11px] shrink-0 text-slate-300/80" /> : null}

                {isCurrent ? (
                  <BreadcrumbPage className="max-w-[9rem] truncate font-medium text-slate-500 sm:max-w-none">
                    {crumb}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    asChild
                    className="max-w-[7rem] truncate text-slate-400 transition-colors hover:text-slate-500 sm:max-w-none"
                  >
                    <Link href="/dashboard">{crumb}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>

              {index < items.length - 1 ? <BreadcrumbSeparator className="mx-0.5 text-slate-300/80 [&>svg]:size-3" /> : null}
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
