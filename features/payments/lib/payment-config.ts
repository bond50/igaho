import type { ApplicationPortalSetting } from '@/prisma/src/generated/prisma/client';

export type PaymentSummary = {
  collectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
  applicationFee: number;
  includeRenewalFeeInApplication: boolean;
  bundledRenewalFee: number;
  baseAmount: number;
  isTaxEnabled: boolean;
  taxPercentage: number;
  applicationTaxAmount: number;
  renewalTaxAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  manualPaymentInstructions: string | null;
  mpesaBusinessName: string | null;
  mpesaPaybillNumber: string | null;
  mpesaShortCode: string | null;
  darajaTransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
};

export type RenewalPaymentSummary = {
  renewalsEnabled: boolean;
  renewalMode: 'MANUAL_REVIEW' | 'PAY_AND_ACTIVATE';
  collectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
  annualRenewalFee: number;
  isTaxEnabled: boolean;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  mpesaBusinessName: string | null;
  mpesaPaybillNumber: string | null;
  mpesaShortCode: string | null;
  darajaTransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
};

function normalizeConfiguredValue(value: string | null | undefined, fallback?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '123456') {
    return fallback ?? null;
  }

  return trimmed;
}

export function buildPaymentSummary(setting: ApplicationPortalSetting | null): PaymentSummary {
  const applicationFee = setting?.applicationFee ?? 0;
  const includeRenewalFeeInApplication = Boolean(setting?.renewalsEnabled && setting?.includeRenewalFeeInApplication);
  const bundledRenewalFee = includeRenewalFeeInApplication ? setting?.annualRenewalFee ?? 0 : 0;
  const baseAmount = applicationFee + bundledRenewalFee;
  const taxPercentage = setting?.isTaxEnabled ? setting?.taxPercentage ?? 0 : 0;
  const applicationTaxAmount = setting?.isTaxEnabled ? Math.round((applicationFee * taxPercentage) / 100) : 0;
  const renewalTaxAmount = setting?.isTaxEnabled ? Math.round((bundledRenewalFee * taxPercentage) / 100) : 0;
  const taxAmount = applicationTaxAmount + renewalTaxAmount;
  const envShortCode = process.env.DARAJA_SHORTCODE ?? null;
  const envTransactionType =
    (process.env.DARAJA_TRANSACTION_TYPE as PaymentSummary['darajaTransactionType'] | undefined) ?? 'CustomerPayBillOnline';

  return {
    collectionMode: setting?.paymentCollectionMode ?? 'MANUAL_PROOF',
    applicationFee,
    includeRenewalFeeInApplication,
    bundledRenewalFee,
    baseAmount,
    isTaxEnabled: setting?.isTaxEnabled ?? false,
    taxPercentage,
    applicationTaxAmount,
    renewalTaxAmount,
    taxAmount,
    totalAmount: baseAmount + taxAmount,
    currency: setting?.currency ?? 'KES',
    manualPaymentInstructions: setting?.manualPaymentInstructions ?? null,
    mpesaBusinessName: setting?.mpesaBusinessName ?? null,
    mpesaPaybillNumber: normalizeConfiguredValue(setting?.mpesaPaybillNumber, envShortCode),
    mpesaShortCode: normalizeConfiguredValue(setting?.mpesaShortCode, envShortCode),
    darajaTransactionType: (setting?.darajaTransactionType as PaymentSummary['darajaTransactionType'] | null) ?? envTransactionType,
  };
}

export function buildRenewalPaymentSummary(setting: ApplicationPortalSetting | null): RenewalPaymentSummary {
  const annualRenewalFee = setting?.annualRenewalFee ?? 0;
  const taxPercentage = setting?.isTaxEnabled ? setting?.taxPercentage ?? 0 : 0;
  const taxAmount = setting?.isTaxEnabled ? Math.round((annualRenewalFee * taxPercentage) / 100) : 0;
  const envShortCode = process.env.DARAJA_SHORTCODE ?? null;
  const envTransactionType =
    (process.env.DARAJA_TRANSACTION_TYPE as RenewalPaymentSummary['darajaTransactionType'] | undefined) ?? 'CustomerPayBillOnline';

  return {
    renewalsEnabled: setting?.renewalsEnabled ?? false,
    renewalMode: (setting?.renewalMode as RenewalPaymentSummary['renewalMode'] | null) ?? 'MANUAL_REVIEW',
    collectionMode: setting?.paymentCollectionMode ?? 'MANUAL_PROOF',
    annualRenewalFee,
    isTaxEnabled: setting?.isTaxEnabled ?? false,
    taxPercentage,
    taxAmount,
    totalAmount: annualRenewalFee + taxAmount,
    currency: setting?.currency ?? 'KES',
    mpesaBusinessName: setting?.mpesaBusinessName ?? null,
    mpesaPaybillNumber: normalizeConfiguredValue(setting?.mpesaPaybillNumber, envShortCode),
    mpesaShortCode: normalizeConfiguredValue(setting?.mpesaShortCode, envShortCode),
    darajaTransactionType: (setting?.darajaTransactionType as RenewalPaymentSummary['darajaTransactionType'] | null) ?? envTransactionType,
  };
}
