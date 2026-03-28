import { NextResponse } from 'next/server';

export { POST } from '@/app/api/payments/mpesa/callback/route';

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'payments-callback',
    message: 'Callback endpoint is reachable.',
  });
}
