// features/auth/actions/logout.ts
'use server';
import { signOut } from '@/auth';

export const logout = async () => {
  await signOut();
};
