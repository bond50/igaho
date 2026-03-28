import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

import { signIn } from '@/auth';

type ActivateRouteProps = {
  request: Request;
};

export async function GET(request: ActivateRouteProps['request']) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    redirect('/auth/new-verification?error=missing');
  }

  try {
    await signIn('verification-link', {
      token,
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect('/auth/new-verification?error=invalid');
    }

    throw error;
  }
}
