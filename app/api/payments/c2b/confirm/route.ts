import { NextResponse } from 'next/server';

export { POST } from '@/app/api/payments/mpesa/c2b/confirm/route';

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'payments-c2b-confirm',
    message: 'Confirmation endpoint is reachable.',
  });
}
