// features/auth/actions/login-google.ts
'use server';

import { signIn } from '@/auth';
import { DEFAULT_LOGIN_REDIRECT } from '@/routes';

export async function loginWithGoogle() {
  await signIn('google', { redirectTo: DEFAULT_LOGIN_REDIRECT });
}
