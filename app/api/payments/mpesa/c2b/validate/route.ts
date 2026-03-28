import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const setting = await db.applicationPortalSetting.findUnique({
    where: { singletonKey: 'default' },
    select: { isC2BEnabled: true, c2bShortCode: true },
  });

  if (!setting?.isC2BEnabled) {
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'C2B validation is not enabled.' });
  }

  const shortCode = readString(payload?.BusinessShortCode);
  const amount = Number(payload?.TransAmount ?? 0);

  if (setting.c2bShortCode && shortCode && setting.c2bShortCode !== shortCode) {
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Short code mismatch for this C2B validation endpoint.' });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Transaction amount is invalid.' });
  }

  return NextResponse.json({ ResultCode: '0', ResultDesc: 'Accepted' });
}
