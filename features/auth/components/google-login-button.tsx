'use client';

import { loginWithGoogle } from '@/features/auth/actions/login-google';
import { Button } from '@/components/ui/button';

const LAST_AUTH_METHOD_KEY = 'igaho:last-auth-method';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path d="M21.8 12.23c0-.73-.06-1.25-.2-1.8H12v3.56h5.64c-.11.88-.69 2.2-1.98 3.09l-.02.12 2.9 2.2.2.02c1.82-1.64 2.86-4.04 2.86-7.19Z" fill="#4285F4" />
      <path d="M12 22c2.76 0 5.08-.89 6.78-2.42l-3.23-2.34c-.86.59-2.02 1-3.55 1-2.7 0-4.99-1.75-5.8-4.17l-.11.01-3.01 2.28-.04.1A10.24 10.24 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.2 14.07A6.02 6.02 0 0 1 5.86 12c0-.72.13-1.41.34-2.07l-.01-.14-3.05-2.31-.1.05A9.87 9.87 0 0 0 2 12c0 1.59.39 3.09 1.08 4.47l3.12-2.4Z" fill="#FBBC05" />
      <path d="M12 5.76c1.93 0 3.24.82 3.98 1.5l2.9-2.77C17.07 2.9 14.76 2 12 2a10.24 10.24 0 0 0-8.96 5.53l3.16 2.4C7 7.5 9.3 5.76 12 5.76Z" fill="#EA4335" />
    </svg>
  );
}

export function GoogleLoginButton({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <form
      action={loginWithGoogle}
      onSubmit={() => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_AUTH_METHOD_KEY, 'google');
        }
      }}
    >
      <Button type="submit" variant="outline" className="w-full justify-center gap-3 rounded-xl border-slate-300 bg-white text-[var(--foreground)] hover:bg-slate-50">
        <GoogleMark />
        {label}
      </Button>
    </form>
  );
}
