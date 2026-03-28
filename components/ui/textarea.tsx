import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-28 w-full rounded-2xl border border-slate-300/90 bg-white px-4 py-3 text-sm text-[var(--foreground)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-400 focus:border-[var(--brand)] focus:bg-white focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,white)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
