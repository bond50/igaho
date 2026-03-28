import { NextResponse } from 'next/server';

export { POST } from '@/app/api/payments/mpesa/c2b/validate/route';

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'payments-c2b-validate',
    message: 'Validation endpoint is reachable.',
  });
}
