// features/auth/utils/current-user.ts
import { auth } from '@/auth';
import type { UserRole } from '@/prisma/src/generated/prisma/client';

type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: UserRole;
  isTwoFAEnabled: boolean;
  isOAuth: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u) return null;

  return {
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
    image: typeof u.image === 'string' ? u.image : null,
    role: u.role,
    isTwoFAEnabled: u.isTwoFAEnabled,
    isOAuth: u.isOAuth,
  };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
