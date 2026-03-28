import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { getDarajaC2BConfigStatus, getDarajaConfigStatus } from '@/features/payments/lib/daraja';
import { buildPaymentSummary } from '@/features/payments/lib/payment-config';
import { db } from '@/lib/db';

const DEFAULT_PORTAL_MESSAGE = 'Applications are currently unavailable. Please check back later.';

export type PortalReadinessIssue = {
  key: string;
  message: string;
  href: string;
};

export type { PaymentSummary as PaymentConfiguration } from '@/features/payments/lib/payment-config';

export async function getMembershipCategories(options?: { activeOnly?: boolean }) {
  return db.membershipCategory.findMany({
    where: options?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { applications: true },
      },
    },
  });
}

export async function getApplicationPortalSetting() {
  return db.applicationPortalSetting.findUnique({
    where: { singletonKey: 'default' },
  });
}

export async function getApplicationPortalSettingWithDefaults() {
  const setting = await getApplicationPortalSetting();
  const fallbackShortCode = process.env.DARAJA_SHORTCODE?.trim() || null;
  const fallbackBusinessName = setting?.setupName?.trim() || setting?.shortName?.trim() || DEFAULT_ORGANIZATION_SHORT_NAME;

  if (!setting) {
    return {
      singletonKey: 'default',
      setupName: null,
      shortName: null,
      isFormOpen: false,
      isAcceptingApplications: false,
      showApplicationFormAfterApproval: false,
      applicationReviewMode: 'MANUAL_REVIEW' as const,
      renewalsEnabled: false,
      renewalMode: 'MANUAL_REVIEW' as const,
      renewalCoverageStartMonth: 1,
      renewalCoverageStartDay: 1,
      renewalCoverageEndMonth: 12,
      renewalCoverageEndDay: 31,
      renewalGraceDays: 0,
      renewalReminderLeadDays: 30,
      renewalReminderFrequency: 'WEEKLY' as const,
      annualRenewalFee: 0,
      includeRenewalFeeInApplication: false,
      showCertificateToActiveMembers: true,
      showCertificateWhenRenewalDue: false,
      showMembershipCardToActiveMembers: true,
      showMembershipCardWhenRenewalDue: false,
      applicantMessage: null,
      paymentCollectionMode: 'MANUAL_PROOF' as const,
      applicationFee: 0,
      isTaxEnabled: false,
      taxPercentage: null,
      currency: 'KES',
      manualPaymentInstructions: null,
      mpesaBusinessName: fallbackBusinessName,
      mpesaPaybillNumber: fallbackShortCode,
      mpesaShortCode: fallbackShortCode,
      darajaTransactionType: (process.env.DARAJA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline') as 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline',
      isC2BEnabled: true,
      c2bShortCode: fallbackShortCode,
      c2bValidationUrl: process.env.DARAJA_C2B_VALIDATION_URL ?? null,
      c2bConfirmationUrl: process.env.DARAJA_C2B_CONFIRMATION_URL ?? null,
      c2bResponseType: (process.env.DARAJA_C2B_RESPONSE_TYPE ?? 'Completed') as 'Completed' | 'Cancelled',
      c2bRegisteredAt: null,
      c2bLastRegistrationNote: null,
      updatedById: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  return {
    ...setting,
    renewalCoverageStartMonth: setting.renewalCoverageStartMonth ?? 1,
    renewalCoverageStartDay: setting.renewalCoverageStartDay ?? 1,
    renewalCoverageEndMonth: setting.renewalCoverageEndMonth ?? 12,
    renewalCoverageEndDay: setting.renewalCoverageEndDay ?? 31,
    renewalGraceDays: setting.renewalGraceDays ?? 0,
    applicationReviewMode: setting.applicationReviewMode ?? 'MANUAL_REVIEW',
    renewalReminderLeadDays: setting.renewalReminderLeadDays ?? 30,
    renewalReminderFrequency: setting.renewalReminderFrequency ?? 'WEEKLY',
    includeRenewalFeeInApplication: setting.includeRenewalFeeInApplication ?? false,
    mpesaBusinessName: setting.mpesaBusinessName?.trim() || fallbackBusinessName,
    mpesaPaybillNumber: setting.mpesaPaybillNumber?.trim() || fallbackShortCode,
    mpesaShortCode: setting.mpesaShortCode?.trim() || fallbackShortCode,
    c2bShortCode: setting.c2bShortCode?.trim() || setting.mpesaShortCode?.trim() || setting.mpesaPaybillNumber?.trim() || fallbackShortCode,
    c2bValidationUrl: setting.c2bValidationUrl?.trim() || process.env.DARAJA_C2B_VALIDATION_URL || null,
    c2bConfirmationUrl: setting.c2bConfirmationUrl?.trim() || process.env.DARAJA_C2B_CONFIRMATION_URL || null,
    c2bResponseType: setting.c2bResponseType ?? ((process.env.DARAJA_C2B_RESPONSE_TYPE ?? 'Completed') as 'Completed' | 'Cancelled'),
    darajaTransactionType: setting.darajaTransactionType ?? ((process.env.DARAJA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline') as 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline'),
  };
}

export async function getPortalBranding() {
  const setting = await db.applicationPortalSetting.findUnique({
    where: { singletonKey: 'default' },
    select: {
      setupName: true,
      shortName: true,
    },
  });

  return {
    organizationName: setting?.setupName || DEFAULT_ORGANIZATION_NAME,
    organizationShortName: setting?.shortName || DEFAULT_ORGANIZATION_SHORT_NAME,
  };
}

export async function getApplicationPortalReadiness() {
  const [setting, activeCategoryCount] = await Promise.all([
    getApplicationPortalSetting(),
    db.membershipCategory.count({ where: { isActive: true } }),
  ]);

  const paymentConfiguration = buildPaymentSummary(setting);
  const darajaStatus = getDarajaConfigStatus({
    shortCode: setting?.mpesaShortCode,
    transactionType: paymentConfiguration.darajaTransactionType,
  });

  const issues: PortalReadinessIssue[] = [];

  if (activeCategoryCount === 0) {
    issues.push({
      key: 'membership-categories',
      message: 'No active membership categories have been configured.',
      href: '/dashboard/setup-assistant#membership-categories',
    });
  }

  if (!setting?.isFormOpen) {
    issues.push({
      key: 'portal-open',
      message: 'The application portal is currently closed.',
      href: '/dashboard/setup-assistant#setup-assistant',
    });
  }

  if (!setting?.isAcceptingApplications) {
    issues.push({
      key: 'portal-intake',
      message: 'New applications are currently paused.',
      href: '/dashboard/setup-assistant#setup-assistant',
    });
  }

  if (paymentConfiguration.applicationFee <= 0) {
    issues.push({
      key: 'application-fee',
      message: 'Set a valid application fee before opening the form.',
      href: '/dashboard/setup-assistant#payment-settings',
    });
  }

  if (paymentConfiguration.isTaxEnabled && paymentConfiguration.taxPercentage <= 0) {
    issues.push({
      key: 'tax-percentage',
      message: 'Enter a valid tax percentage or disable tax.',
      href: '/dashboard/setup-assistant#payment-settings',
    });
  }

  if (paymentConfiguration.collectionMode === 'MANUAL_PROOF' && !paymentConfiguration.manualPaymentInstructions?.trim()) {
    issues.push({
      key: 'manual-payment-instructions',
      message: 'Manual payment instructions are required when manual proof is enabled.',
      href: '/dashboard/setup-assistant#payment-settings',
    });
  }

  if (paymentConfiguration.collectionMode === 'MPESA_DARAJA') {
    if (!paymentConfiguration.mpesaBusinessName?.trim()) {
      issues.push({
        key: 'mpesa-business-name',
        message: 'Set the M-Pesa business name before enabling Daraja on the form.',
        href: '/dashboard/setup-assistant#payment-settings',
      });
    }

    if (!paymentConfiguration.mpesaPaybillNumber?.trim()) {
      issues.push({
        key: 'mpesa-paybill',
        message: 'Set the M-Pesa paybill number before enabling Daraja on the form.',
        href: '/dashboard/setup-assistant#payment-settings',
      });
    }

    if (!paymentConfiguration.mpesaShortCode?.trim()) {
      issues.push({
        key: 'mpesa-short-code',
        message: 'Set the Daraja short code before enabling Daraja on the form.',
        href: '/dashboard/setup-assistant#payment-settings',
      });
    }

    if (!darajaStatus.isConfigured) {
      issues.push({
        key: 'daraja-env',
        message: 'Daraja environment variables are incomplete for the configured M-Pesa short code.',
        href: '/dashboard/setup-assistant#setup-assistant',
      });
    }
  }

  return {
    setting,
    paymentConfiguration,
    darajaStatus,
    activeCategoryCount,
    isReady: issues.length === 0,
    issues,
    applicantMessage: setting?.applicantMessage?.trim() || DEFAULT_PORTAL_MESSAGE,
  };
}

export async function getApplicationPaymentConfiguration() {
  const setting = await getApplicationPortalSetting();
  return buildPaymentSummary(setting);
}
