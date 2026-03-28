import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { markHeaderNotificationRead } from '@/features/application/actions/notifications';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { createdAt?: string | null } | null;
  if (!body?.createdAt) {
    return NextResponse.json({ error: 'Missing createdAt' }, { status: 400 });
  }

  await markHeaderNotificationRead(body.createdAt);
  return NextResponse.json({ success: true });
}
