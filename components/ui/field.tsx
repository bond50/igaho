import * as React from 'react';

import { cn } from '@/lib/utils';

function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-2.5', className)} {...props} />;
}

function FieldLabel({ className, required, children, ...props }: React.ComponentProps<'label'> & { required?: boolean }) {
  return (
    <label className={cn('text-sm font-semibold text-slate-900', className)} {...props}>
      {children}
      {required ? <span className="ml-1 text-rose-600">*</span> : null}
    </label>
  );
}

function FieldDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs leading-5 text-slate-500', className)} {...props} />;
}

function FieldError({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  if (!children) return null;
  return <p className={cn('text-sm font-medium text-rose-600', className)} {...props}>{children}</p>;
}

export { Field, FieldDescription, FieldError, FieldLabel };
