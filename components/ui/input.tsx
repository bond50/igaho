import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl border border-slate-300/90 bg-white px-4 py-2.5 text-sm text-[var(--foreground)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-400 focus:border-[var(--brand)] focus:bg-white focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,white)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
