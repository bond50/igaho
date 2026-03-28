import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

type FloatingInputProps = ComponentProps<typeof Input> & {
  label: string;
  error?: string;
  description?: string;
};

export function FloatingInput({
  id,
  label,
  error,
  description,
  className,
  ...props
}: FloatingInputProps) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          id={id}
          placeholder=" "
          className={["peer pt-5", className].filter(Boolean).join(' ')}
          {...props}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 top-1/2 origin-left -translate-y-1/2 bg-white px-1 text-sm text-slate-500 transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-0 peer-focus:text-xs peer-focus:font-medium peer-focus:text-[var(--brand)] peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium"
        >
          {label}
        </label>
      </div>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
