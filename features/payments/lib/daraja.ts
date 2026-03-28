import { Buffer } from 'node:buffer';

import { getDarajaGuardrailStatus } from '@/features/payments/lib/guards';

const darajaEnvValues = ['sandbox', 'production'] as const;
export type DarajaEnvironment = (typeof darajaEnvValues)[number];
export type DarajaTransactionType = 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';

type DarajaConfig = {
  environment: DarajaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  callbackUrl: string;
  transactionType: DarajaTransactionType;
  baseUrl: string;
};

type DarajaOverrides = {
  shortCode?: string | null;
  transactionType?: DarajaTransactionType;
};

type InitiateStkPushInput = {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  shortCode?: string | null;
  transactionType?: DarajaTransactionType;
};

export type DarajaStkPushResponse = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
};

export type DarajaStkQueryResponse = {
  ResponseCode?: string;
  ResponseDescription?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
};

export type DarajaTransactionStatusResponse = {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
};

export type DarajaC2BRegisterResponse = {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
};

function getBaseUrl(environment: DarajaEnvironment) {
  return environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

export function getDarajaConfigStatus(overrides?: DarajaOverrides): {
  environment: DarajaEnvironment;
  callbackUrl: string;
  baseUrl: string;
  transactionType: DarajaTransactionType;
  shortCode: string | null;
  isConfigured: boolean;
  missing: string[];
  guardrailErrors: string[];
  guardrailWarnings: string[];
} {
  const environment = (process.env.DARAJA_ENVIRONMENT ?? 'sandbox') as DarajaEnvironment;
  const callbackUrl = process.env.DARAJA_CALLBACK_URL ?? `${process.env.CLIENT_URL ?? ''}/api/payments/callback`;
  const shortCode = overrides?.shortCode ?? process.env.DARAJA_SHORTCODE;
  const transactionType = overrides?.transactionType ?? ((process.env.DARAJA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline') as DarajaTransactionType);
  const configChecks: Array<[string, string | undefined | null]> = [
    ['DARAJA_CONSUMER_KEY', process.env.DARAJA_CONSUMER_KEY],
    ['DARAJA_CONSUMER_SECRET', process.env.DARAJA_CONSUMER_SECRET],
    ['DARAJA_PASSKEY', process.env.DARAJA_PASSKEY],
    ['DARAJA_CALLBACK_URL or CLIENT_URL', callbackUrl],
    ['M-Pesa short code', shortCode],
  ];
  const missing = configChecks.reduce<string[]>((issues, [key, value]) => {
    if (!value) issues.push(key);
    return issues;
  }, []);

  const guardrails = getDarajaGuardrailStatus({ environment, callbackUrl, shortCode });

  return {
    environment,
    callbackUrl,
    baseUrl: getBaseUrl(environment),
    transactionType,
    shortCode: shortCode ?? null,
    isConfigured: missing.length === 0 && guardrails.errors.length === 0,
    missing,
    guardrailErrors: guardrails.errors,
    guardrailWarnings: guardrails.warnings,
  };
}

export function getDarajaC2BConfigStatus(overrides?: { shortCode?: string | null; validationUrl?: string | null; confirmationUrl?: string | null; responseType?: 'Completed' | 'Cancelled' | null }) {
  const environment = (process.env.DARAJA_ENVIRONMENT ?? 'sandbox') as DarajaEnvironment;
  const baseUrl = getBaseUrl(environment);
  const shortCode = overrides?.shortCode ?? process.env.DARAJA_SHORTCODE;
  const validationUrl = overrides?.validationUrl ?? process.env.DARAJA_C2B_VALIDATION_URL ?? `${process.env.CLIENT_URL ?? ''}/api/payments/c2b/validate`;
  const confirmationUrl = overrides?.confirmationUrl ?? process.env.DARAJA_C2B_CONFIRMATION_URL ?? `${process.env.CLIENT_URL ?? ''}/api/payments/c2b/confirm`;
  const responseType = overrides?.responseType ?? ((process.env.DARAJA_C2B_RESPONSE_TYPE ?? 'Completed') as 'Completed' | 'Cancelled');
  const checks: Array<[string, string | undefined | null]> = [
    ['DARAJA_CONSUMER_KEY', process.env.DARAJA_CONSUMER_KEY],
    ['DARAJA_CONSUMER_SECRET', process.env.DARAJA_CONSUMER_SECRET],
    ['C2B short code', shortCode],
    ['C2B validation URL or CLIENT_URL', validationUrl],
    ['C2B confirmation URL or CLIENT_URL', confirmationUrl],
  ];
  const missing = checks.reduce<string[]>((issues, [key, value]) => {
    if (!value) issues.push(key);
    return issues;
  }, []);

  return {
    environment,
    baseUrl,
    shortCode: shortCode ?? null,
    validationUrl,
    confirmationUrl,
    responseType,
    isConfigured: missing.length === 0,
    missing,
  };
}

export function getDarajaTransactionStatusConfigStatus() {
  const environment = (process.env.DARAJA_ENVIRONMENT ?? 'sandbox') as DarajaEnvironment;
  const baseUrl = getBaseUrl(environment);
  const resultUrl = process.env.DARAJA_TRANSACTION_STATUS_RESULT_URL ?? `${process.env.CLIENT_URL ?? ''}/api/payments/mpesa/transaction-status/result`;
  const timeoutUrl = process.env.DARAJA_TRANSACTION_STATUS_TIMEOUT_URL ?? `${process.env.CLIENT_URL ?? ''}/api/payments/mpesa/transaction-status/timeout`;
  const checks: Array<[string, string | undefined | null]> = [
    ['DARAJA_INITIATOR_NAME', process.env.DARAJA_INITIATOR_NAME],
    ['DARAJA_SECURITY_CREDENTIAL', process.env.DARAJA_SECURITY_CREDENTIAL],
    ['DARAJA_TRANSACTION_STATUS_RESULT_URL or CLIENT_URL', resultUrl],
    ['DARAJA_TRANSACTION_STATUS_TIMEOUT_URL or CLIENT_URL', timeoutUrl],
    ['DARAJA_SHORTCODE', process.env.DARAJA_SHORTCODE],
  ];
  const missing = checks.reduce<string[]>((issues, [key, value]) => {
    if (!value) issues.push(key);
    return issues;
  }, []);

  return {
    environment,
    baseUrl,
    resultUrl,
    timeoutUrl,
    isConfigured: missing.length === 0,
    missing,
  };
}

export function getDarajaConfig(overrides?: DarajaOverrides): DarajaConfig {
  const status = getDarajaConfigStatus(overrides);
  if (!status.isConfigured || !status.shortCode) {
    const issues = [...status.missing, ...status.guardrailErrors];
    throw new Error(`Daraja is not configured. Missing: ${issues.join(', ')}`);
  }

  return {
    environment: status.environment,
    consumerKey: process.env.DARAJA_CONSUMER_KEY!,
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET!,
    shortCode: status.shortCode,
    passkey: process.env.DARAJA_PASSKEY!,
    callbackUrl: status.callbackUrl,
    transactionType: status.transactionType,
    baseUrl: status.baseUrl,
  };
}

export function formatMpesaPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `254${digits}`;
  throw new Error('Phone number must be a valid Kenyan Safaricom line such as 07XXXXXXXX or 2547XXXXXXXX.');
}

export function buildDarajaTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function buildDarajaPassword(shortCode: string, passkey: string, timestamp: string) {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
}

export function parseMpesaTransactionDate(value?: string | number | null) {
  if (!value) return null;
  const raw = String(value);
  if (!/^\d{14}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6)) - 1;
  const day = Number(raw.slice(6, 8));
  const hours = Number(raw.slice(8, 10));
  const minutes = Number(raw.slice(10, 12));
  const seconds = Number(raw.slice(12, 14));
  return new Date(year, month, day, hours, minutes, seconds);
}

export async function getDarajaAccessToken(overrides?: DarajaOverrides) {
  const config = getDarajaConfig(overrides);
  const basicAuth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}` },
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.errorMessage ?? data?.error_description ?? 'Unable to fetch Daraja access token.');
  }

  return data.access_token as string;
}

export async function initiateDarajaStkPush(input: InitiateStkPushInput) {
  const overrides: DarajaOverrides = { shortCode: input.shortCode, transactionType: input.transactionType };
  const config = getDarajaConfig(overrides);
  const timestamp = buildDarajaTimestamp();
  const password = buildDarajaPassword(config.shortCode, config.passkey, timestamp);
  const accessToken = await getDarajaAccessToken(overrides);
  const phoneNumber = formatMpesaPhoneNumber(input.phoneNumber);

  const payload = {
    BusinessShortCode: config.shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.transactionType,
    Amount: Math.round(input.amount),
    PartyA: phoneNumber,
    PartyB: config.shortCode,
    PhoneNumber: phoneNumber,
    CallBackURL: config.callbackUrl,
    AccountReference: input.accountReference,
    TransactionDesc: input.transactionDesc,
  };

  const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? data?.ResponseDescription ?? 'Unable to initiate Daraja STK push.');
  }

  return {
    payload,
    response: data as DarajaStkPushResponse,
    callbackUrl: config.callbackUrl,
    environment: config.environment,
  };
}

export async function queryDarajaStkPushStatus(input: { checkoutRequestId: string; shortCode?: string | null }) {
  const overrides: DarajaOverrides = { shortCode: input.shortCode };
  const config = getDarajaConfig(overrides);
  const timestamp = buildDarajaTimestamp();
  const password = buildDarajaPassword(config.shortCode, config.passkey, timestamp);
  const accessToken = await getDarajaAccessToken(overrides);

  const payload = {
    BusinessShortCode: config.shortCode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: input.checkoutRequestId,
  };

  const response = await fetch(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? data?.ResponseDescription ?? 'Unable to query Daraja STK push status.');
  }

  return {
    payload,
    response: data as DarajaStkQueryResponse,
    callbackUrl: config.callbackUrl,
    environment: config.environment,
  };
}

export async function queryDarajaTransactionStatus(input: { transactionId: string; shortCode?: string | null; remarks?: string; occasion?: string }) {
  const config = getDarajaConfig({ shortCode: input.shortCode });
  const txStatusConfig = getDarajaTransactionStatusConfigStatus();
  if (!txStatusConfig.isConfigured) {
    throw new Error(`Daraja transaction status is not configured. Missing: ${txStatusConfig.missing.join(', ')}`);
  }

  const accessToken = await getDarajaAccessToken({ shortCode: input.shortCode });
  const payload = {
    Initiator: process.env.DARAJA_INITIATOR_NAME,
    SecurityCredential: process.env.DARAJA_SECURITY_CREDENTIAL,
    CommandID: 'TransactionStatusQuery',
    TransactionID: input.transactionId,
    PartyA: config.shortCode,
    IdentifierType: '4',
    ResultURL: txStatusConfig.resultUrl,
    QueueTimeOutURL: txStatusConfig.timeoutUrl,
    Remarks: input.remarks ?? 'IGANO payment verification',
    Occasion: input.occasion ?? 'Membership payment verification',
  };

  const response = await fetch(`${config.baseUrl}/mpesa/transactionstatus/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? data?.ResponseDescription ?? 'Unable to start Daraja transaction status query.');
  }

  return {
    payload,
    response: data as DarajaTransactionStatusResponse,
    environment: config.environment,
    resultUrl: txStatusConfig.resultUrl,
    timeoutUrl: txStatusConfig.timeoutUrl,
  };
}


export async function registerDarajaC2BUrls(input?: { shortCode?: string | null; validationUrl?: string | null; confirmationUrl?: string | null; responseType?: 'Completed' | 'Cancelled' | null }) {
  const c2bStatus = getDarajaC2BConfigStatus(input);
  if (!c2bStatus.isConfigured || !c2bStatus.shortCode) {
    throw new Error(`Daraja C2B is not configured. Missing: ${c2bStatus.missing.join(', ')}`);
  }

  const accessToken = await getDarajaAccessToken({ shortCode: c2bStatus.shortCode });
  const payload = {
    ShortCode: c2bStatus.shortCode,
    ResponseType: c2bStatus.responseType,
    ConfirmationURL: c2bStatus.confirmationUrl,
    ValidationURL: c2bStatus.validationUrl,
  };

  const response = await fetch(`${c2bStatus.baseUrl}/mpesa/c2b/v1/registerurl`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? data?.ResponseDescription ?? 'Unable to register Daraja C2B URLs.');
  }

  return {
    payload,
    response: data as DarajaC2BRegisterResponse,
    environment: c2bStatus.environment,
  };
}
