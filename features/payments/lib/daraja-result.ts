export type MpesaRequestStatus = 'INITIATED' | 'AWAITING_CALLBACK' | 'CALLBACK_RECEIVED' | 'SUCCESS' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

export function mapDarajaResultCodeToStatus(resultCode: number | null | undefined): MpesaRequestStatus {
  const code = resultCode ?? null;
  if (code === 0) return 'SUCCESS';
  if (code === 1032) return 'CANCELLED';
  if (code === 1037) return 'TIMEOUT';
  return code === null ? 'AWAITING_CALLBACK' : 'FAILED';
}

export function interpretDarajaFailure(resultCode: number | null | undefined, resultDesc: string | null | undefined, status?: MpesaRequestStatus) {
  const code = resultCode ?? null;
  const desc = resultDesc?.trim() || null;
  const normalized = desc?.toLowerCase() ?? '';

  if (status === 'VERIFIED') {
    return {
      label: 'Payment verified',
      detail: desc ?? 'The payment was confirmed and independently verified through Daraja reconciliation.',
      guidance: null,
    };
  }

  if (status === 'SUCCESS' || code === 0) {
    return {
      label: 'Payment completed',
      detail: desc ?? 'M-Pesa confirmed the payment successfully.',
      guidance: null,
    };
  }

  if (status === 'INITIATED' || status === 'AWAITING_CALLBACK' || status === 'CALLBACK_RECEIVED') {
    return {
      label: 'Waiting for callback',
      detail: desc ?? 'The STK push has been sent. Complete the payment on the handset or wait for the callback.',
      guidance: null,
    };
  }

  if (status === 'TIMEOUT' || code === 1037 || normalized.includes('no response from user')) {
    return {
      label: 'STK prompt timed out',
      detail: desc ?? 'Daraja did not receive a response from the handset.',
      guidance: 'Ask the payer to unlock the phone, confirm network coverage, and retry the STK push promptly.',
    };
  }

  if (status === 'CANCELLED' || code === 1032 || normalized.includes('cancel')) {
    const wrongPin = normalized.includes('pin');
    return {
      label: wrongPin ? 'Wrong M-Pesa PIN entered' : 'Payment cancelled on handset',
      detail: desc ?? (wrongPin ? 'The M-Pesa PIN entered on the handset was rejected.' : 'The payer cancelled the STK prompt before completion.'),
      guidance: wrongPin ? 'Retry the payment and enter the correct M-Pesa PIN.' : 'Retry the STK push and complete it on the handset without dismissing the prompt.',
    };
  }

  if (code === 2001 || normalized.includes('initiator information is invalid')) {
    return {
      label: 'Merchant configuration is invalid',
      detail: desc ?? 'Daraja rejected the merchant credentials or shortcode details for this STK request.',
      guidance: 'Check the shortcode, passkey, transaction type, and app product mapping in Daraja before retrying.',
    };
  }

  if (normalized.includes('insufficient')) {
    return {
      label: 'Insufficient M-Pesa balance',
      detail: desc ?? 'The payer account did not have enough balance to complete the payment.',
      guidance: 'Top up the M-Pesa wallet or retry with another number.',
    };
  }

  if (normalized.includes('exceed') || normalized.includes('limit')) {
    return {
      label: 'M-Pesa transaction limit reached',
      detail: desc ?? 'The payer or merchant has hit an M-Pesa transaction limit.',
      guidance: 'Retry later or use a different eligible account if appropriate.',
    };
  }

  return {
    label: 'Payment failed',
    detail: desc ?? 'Daraja returned a failure result for this request.',
    guidance: code ? `Review Daraja result code ${code} and the raw response before retrying.` : 'Review the Daraja response and retry when the issue is resolved.',
  };
}
