import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { runMpesaReconciliationPass } from '@/features/payments/lib/daraja-reconciliation';

function isAuthorizedCron(request: Request) {
  const secret = process.env.PAYMENTS_RECONCILE_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const session = await auth();
  const isAdmin = session?.user?.role === 'ADMIN';
  const isCron = isAuthorizedCron(request);

  if (!isAdmin && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 25);
  const summary = await runMpesaReconciliationPass(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25);

  return NextResponse.json(summary);
}
