import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getHeaderNotifications } from '@/features/application/queries/application';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ unreadCount: 0, items: [] });
  }

  const notifications = await getHeaderNotifications(session.user.role === 'ADMIN', session.user.id);
  return NextResponse.json(notifications);
}
