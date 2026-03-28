import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { clearHeaderNotification, clearHeaderNotifications } from '@/features/application/actions/notifications';

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { notificationId?: string; notificationIds?: string[] }
    | null;

  if (body?.notificationId) {
    await clearHeaderNotification(body.notificationId);
    return NextResponse.json({ ok: true });
  }

  if (body?.notificationIds?.length) {
    await clearHeaderNotifications(body.notificationIds);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
}
