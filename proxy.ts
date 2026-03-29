// proxy.ts
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import {
  apiAuthPrefix,
  authRoutes,
  DEFAULT_LOGIN_REDIRECT,
  forbiddenRoute,
  isProtectedPath,
  mfaRoute,
  unauthorizedRoute,
} from '@/routes';
import { assertNotRateLimitedAuthAPI } from '@/features/auth/utils/rate-limit';

function requiresAdmin(pathname: string) {
  return (
    pathname === '/dashboard/settings' ||
    pathname.startsWith('/dashboard/settings/') ||
    pathname.startsWith('/dashboard/applications/') ||
    pathname === '/dashboard/export' ||
    pathname.startsWith('/dashboard/export/')
  );
}

function isSafeRedirectTarget(target: string | null): target is string {
  return !!target && target.startsWith('/') && !target.startsWith('//');
}

export const proxy = auth(async (req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const session = req.auth as Session | null;
  const isLoggedIn = !!session;

  if (pathname.startsWith(apiAuthPrefix)) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'ip:unknown';
    try {
      await assertNotRateLimitedAuthAPI(ip);
    } catch {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api') || pathname.startsWith('/trpc')) {
    if (session?.mfaRequired && !session.mfaVerified) {
      return NextResponse.json({ message: 'MFA required.' }, { status: 403 });
    }

    return NextResponse.next();
  }

  if (pathname === '/auth/new-verification') {
    return NextResponse.next();
  }

  if (pathname === mfaRoute) {
    if (!isLoggedIn) {
      const cb = encodeURIComponent(`${nextUrl.pathname}${nextUrl.search}`);
      return NextResponse.redirect(new URL(`/auth/login?callbackUrl=${cb}`, nextUrl));
    }
    if (session.mfaVerified) {
      const nextParam = nextUrl.searchParams.get('next');
      const dest = isSafeRedirectTarget(nextParam) ? nextParam : DEFAULT_LOGIN_REDIRECT;
      return NextResponse.redirect(new URL(dest, nextUrl));
    }
    return NextResponse.next();
  }

  const isAuthRoute = authRoutes.includes(pathname);
  if (isAuthRoute) {
    if (!isLoggedIn) {
      return NextResponse.next();
    }

    if (session.mfaRequired && !session.mfaVerified) {
      const cb = encodeURIComponent(`${nextUrl.pathname}${nextUrl.search}`);
      return NextResponse.redirect(new URL(`${mfaRoute}?next=${cb}`, nextUrl));
    }

    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
  }

  if (isProtectedPath(pathname)) {
    if (!isLoggedIn) {
      const cb = encodeURIComponent(`${nextUrl.pathname}${nextUrl.search}`);
      return NextResponse.redirect(new URL(`/auth/login?callbackUrl=${cb}`, nextUrl));
    }

    if (requiresAdmin(pathname) && session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL(forbiddenRoute, nextUrl));
    }

    if (session.mfaRequired && !session.mfaVerified) {
      const cb = encodeURIComponent(`${nextUrl.pathname}${nextUrl.search}`);
      return NextResponse.redirect(new URL(`${mfaRoute}?next=${cb}`, nextUrl));
    }
  }

  if (pathname === forbiddenRoute || pathname === unauthorizedRoute) {
    if (isLoggedIn && session.mfaVerified) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
