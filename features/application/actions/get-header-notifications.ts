"use server";

import { auth } from '@/auth';
import { getHeaderNotifications } from '@/features/application/queries/application';

export async function getCurrentUserHeaderNotifications() {
  const session = await auth();

  if (!session?.user?.id) {
    return { unreadCount: 0, items: [] as Awaited<ReturnType<typeof getHeaderNotifications>>['items'] };
  }

  return getHeaderNotifications(session.user.role === 'ADMIN', session.user.id);
}
