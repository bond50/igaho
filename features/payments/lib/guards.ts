function splitList(value?: string | null) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getDarajaGuardrailStatus(input: {
  environment: 'sandbox' | 'production';
  callbackUrl: string;
  shortCode?: string | null;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const callbackUrl = input.callbackUrl;

  if (input.environment === 'production') {
    if (!callbackUrl.startsWith('https://')) {
      errors.push('Production callback URLs must use HTTPS.');
    }
    if (/localhost|127\.0\.0\.1|ngrok|\.local/i.test(callbackUrl)) {
      errors.push('Production callback URL cannot point to localhost, ngrok, or local-only hosts.');
    }
    if (input.shortCode === '174379') {
      errors.push('Sandbox shortcode 174379 cannot be used in production.');
    }
  }

  if (input.environment === 'sandbox') {
    if (!callbackUrl) {
      warnings.push('Sandbox callback URL is missing.');
    } else if (!/^https?:\/\//i.test(callbackUrl)) {
      warnings.push('Sandbox callback URL should be an absolute URL.');
    }
  }

  if (!process.env.DARAJA_ALLOWED_IPS && input.environment === 'production') {
    warnings.push('DARAJA_ALLOWED_IPS is not configured. Callback trust checks are not enforced yet.');
  }

  return { errors, warnings };
}

export function assertTrustedDarajaRequest(request: Request) {
  const requireTrustedNetwork = process.env.DARAJA_REQUIRE_TRUSTED_NETWORK === 'true';
  const allowedIps = splitList(process.env.DARAJA_ALLOWED_IPS);

  if (!requireTrustedNetwork || allowedIps.length === 0) {
    return;
  }

  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const sourceIp = forwardedFor.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';

  if (!sourceIp || !allowedIps.includes(sourceIp)) {
    throw new Error('Rejected callback from an untrusted network source.');
  }
}
