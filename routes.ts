// routes.ts
export const protectedRoutes: string[] = ['/dashboard', '/settings', '/account', '/apply', '/profile'];

export const authRoutes: string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/reset',
  '/auth/new-password',
  '/auth/error',
  '/auth/verify-email',
  '/auth/new-verification',
  // ⛔ do NOT add "/auth/2fa" here
];

export const apiAuthPrefix = '/api/auth';
export const DEFAULT_LOGIN_REDIRECT = '/dashboard';

export const mfaRoute = '/auth/2fa';
export const forbiddenRoute = '/forbidden'; // OAuth denied
export const unauthorizedRoute = '/auth/unauthorized'; // Credentials denied

export const isProtectedPath = (pathname: string) =>
  protectedRoutes.some((base) => pathname === base || pathname.startsWith(`${base}/`));
